const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const { query } = require('../dbClient');

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
  const usaMovimiento = [5, 6].includes(claseNum);
  const valorCol = usaMovimiento ? 'movimiento_debito' : 'saldo_final';
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

module.exports = router;
