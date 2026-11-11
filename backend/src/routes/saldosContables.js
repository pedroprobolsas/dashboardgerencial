const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const { query } = require('../dbClient');
const { requireRole } = require('../middleware/auth');
const { recargarMesContableSiigo } = require('../services/siigoContableSync');

const LOCK_ID_SIIGO_CONTABLE = 'siigo_contable';

router.get('/', asyncHandler('/api/saldos-contables', async (req, res) => {
  const anio = parseInt(req.query.anio, 10);
  const mes = parseInt(req.query.mes, 10);
  
  // Parametros para la metadata (ventas, costos) del mes seleccionado en el frontend
  // Permite traer la metadata de un mes especifico SIN filtrar el historial completo de saldos.
  const anioMeta = parseInt(req.query.anio_meta, 10) || anio;
  const mesMeta = parseInt(req.query.mes_meta, 10) || mes;

  let sql = `
    SELECT fecha, clase, valor, tipo
    FROM app_ops.v_saldos_mensuales_por_clase
  `;
  const params = [];

  if (anio && mes) {
    const primerDiaMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
    sql += ` WHERE fecha >= $1::date AND fecha < ($1::date + INTERVAL '1 month')`;
    params.push(primerDiaMes);
  } else if (anio) {
    sql += ` WHERE EXTRACT(YEAR FROM fecha) = $1`;
    params.push(anio);
  }

  sql += ` ORDER BY fecha ASC, clase ASC`;

  // Promesas base
  const promesas = [
    query(sql, params),
    query(`SELECT MAX(creado_en) as max_fecha FROM app_ops.saldos_contables_siigo`)
  ];

  // Si nos piden metadata de un mes (via anio_meta/mes_meta, o anio/mes normal), agregamos las consultas
  if (anioMeta && mesMeta) {
    const primerDiaMeta = `${anioMeta}-${String(mesMeta).padStart(2, '0')}-01`;
    promesas.push(
      query(`
        SELECT COALESCE(SUM(valor_bruto), 0) AS total_bruto
        FROM crisolweb.facturas
        WHERE fecha_creacion >= $1::date
          AND fecha_creacion < ($1::date + INTERVAL '1 month')
          AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))
      `, [primerDiaMeta]),
      query(`
        SELECT COALESCE(costos_mano_obra_72, 0) + COALESCE(costos_otros_73, 0) AS total_produccion
        FROM app_ops.siigo_costos_produccion_resumen
        WHERE anio = $1 AND mes = $2
      `, [anioMeta, mesMeta])
    );
  }

  const resultados = await Promise.all(promesas);
  const saldosRes = resultados[0];
  const maxFechaRes = resultados[1];
  
  let ventas_sin_iva = 0;
  let costos_produccion = 0;

  if (anioMeta && mesMeta) {
    ventas_sin_iva = parseFloat(resultados[2].rows[0]?.total_bruto || 0);
    costos_produccion = parseFloat(resultados[3].rows[0]?.total_produccion || 0);
  }

  res.json({ 
    ok: true, 
    data: saldosRes.rows,
    ventas_sin_iva,
    costos_produccion,
    ultima_actualizacion: maxFechaRes.rows[0]?.max_fecha || null
  });
}));

router.get('/detalle', asyncHandler('/api/saldos-contables/detalle', async (req, res) => {
  const { clase, fecha } = req.query;

  if (!clase || !fecha) {
    return res.status(400).json({ ok: false, error: 'Se requieren parǭmetros clase y fecha' });
  }

  const claseNum = parseInt(clase, 10);
  let valorCol = 'saldo_final';
  if ([5, 6].includes(claseNum)) {
    valorCol = 'movimiento_debito';
  } else if (claseNum === 4) {
    valorCol = '(movimiento_credito - movimiento_debito)';
  }
  const primerDiaMes = `${fecha.substring(0, 7)}-01`;

  const sql = `
    SELECT 
      codigo_cuenta, 
      nombre_cuenta, 
      ${valorCol} AS valor
    FROM app_ops.saldos_contables_siigo
    WHERE clase = $1
      AND fecha >= $2::date AND fecha < ($2::date + INTERVAL '1 month')
    ORDER BY codigo_cuenta ASC
  `;
  
  const { rows } = await query(sql, [claseNum, primerDiaMes]);

  res.json({ ok: true, data: rows });
}));

// Exportación del balance de un mes: una fila por cuenta, todas las clases cargadas.
// Los valores salen crudos de la tabla; solo "movimiento_mes" se deriva:
//   - Clases 5 y 6: movimiento_debito (mismo valor que muestra la pantalla).
//   - Resto de clases: movimiento_debito - movimiento_credito (neto crudo, sin invertir signo).
// La fecha sale como texto para que no haya corrimiento por zona horaria.
const SQL_EXPORT_BALANCE_MES = `
  SELECT
    to_char(fecha, 'YYYY-MM') AS periodo,
    clase,
    codigo_cuenta,
    nombre_cuenta,
    saldo_inicial,
    movimiento_debito,
    movimiento_credito,
    CASE
      WHEN clase IN (5, 6) THEN movimiento_debito
      ELSE movimiento_debito - movimiento_credito
    END AS movimiento_mes,
    saldo_final
  FROM app_ops.saldos_contables_siigo
  WHERE fecha >= $1::date AND fecha < ($1::date + INTERVAL '1 month')
  ORDER BY clase ASC, codigo_cuenta ASC
`;

router.get('/export', asyncHandler('/api/saldos-contables/export', async (req, res) => {
  const anio = parseInt(req.query.anio, 10);
  const mes = parseInt(req.query.mes, 10);

  const esAnioValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;
  const esMesValido = Number.isInteger(mes) && mes >= 1 && mes <= 12;
  if (!esAnioValido || !esMesValido) {
    return res.status(400).json({ ok: false, error: 'Parámetros requeridos: anio (YYYY) y mes (1-12)' });
  }

  const primerDiaMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const { rows } = await query(SQL_EXPORT_BALANCE_MES, [primerDiaMes]);

  res.json({ ok: true, data: rows });
}));

router.post('/recargar-mes', requireRole('admin'), asyncHandler('/api/saldos-contables/recargar-mes', async (req, res) => {
  const anio = parseInt(req.body?.anio, 10);
  const mes = parseInt(req.body?.mes, 10);

  const esAnioValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;
  const esMesValido = Number.isInteger(mes) && mes >= 1 && mes <= 12;
  if (!esAnioValido || !esMesValido) {
    return res.status(400).json({ ok: false, error: 'Parámetros requeridos: anio (YYYY) y mes (1-12)' });
  }

  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  // Adquisición atómica de lock en app_ops.pipeline_locks (expira en 10 min si quedara huérfano)
  const lockRes = await query(
    `INSERT INTO app_ops.pipeline_locks (
      pipeline_id, status, locked_by_user_id, locked_at, last_heartbeat_at, last_error
    ) VALUES ($1, 'in_progress', $2, NOW(), NOW(), NULL)
    ON CONFLICT (pipeline_id) DO UPDATE SET
      status = 'in_progress',
      locked_by_user_id = EXCLUDED.locked_by_user_id,
      locked_at = NOW(),
      last_heartbeat_at = NOW(),
      last_error = NULL
    WHERE app_ops.pipeline_locks.status != 'in_progress'
       OR COALESCE(app_ops.pipeline_locks.last_heartbeat_at, app_ops.pipeline_locks.locked_at) < NOW() - INTERVAL '10 minutes'
    RETURNING pipeline_id`,
    [LOCK_ID_SIIGO_CONTABLE, req.user.id]
  );

  if (lockRes.rowCount === 0) {
    return res.status(409).json({
      ok: false,
      error: 'Ya hay una recarga desde SIIGO en ejecución. Espera a que termine e intenta de nuevo.',
    });
  }

  const logRes = await query(
    `INSERT INTO app_ops.action_logs (usuario_id, accion, recurso, origen, resultado)
     VALUES ($1, 'RECARGAR_MES_SIIGO', $2, 'dashboard_web', 'in_progress')
     RETURNING id`,
    [req.user.id, periodo]
  );
  const actionLogId = logRes.rows[0]?.id;

  try {
    const resultado = await recargarMesContableSiigo(anio, mes);

    await query(
      `UPDATE app_ops.pipeline_locks
       SET status = 'completed', completed_at = NOW(), last_error = NULL
       WHERE pipeline_id = $1`,
      [LOCK_ID_SIIGO_CONTABLE]
    );

    if (actionLogId) {
      await query(
        `UPDATE app_ops.action_logs
         SET resultado = 'completed', detalle = $1
         WHERE id = $2`,
        [JSON.stringify(resultado), actionLogId]
      );
    }

    return res.json({ ok: true, data: resultado });
  } catch (err) {
    const mensajeError = err.message || 'Error desconocido al recargar desde SIIGO';

    await query(
      `UPDATE app_ops.pipeline_locks
       SET status = 'failed', completed_at = NOW(), last_error = $1
       WHERE pipeline_id = $2`,
      [mensajeError, LOCK_ID_SIIGO_CONTABLE]
    );

    if (actionLogId) {
      await query(
        `UPDATE app_ops.action_logs
         SET resultado = 'failed', detalle = $1
         WHERE id = $2`,
        [JSON.stringify({ periodo, error: mensajeError }), actionLogId]
      );
    }

    return res.status(500).json({ ok: false, error: mensajeError });
  }
}));

module.exports = router;
