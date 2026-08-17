'use strict';
const { Router } = require('express');
const { query, pool } = require('../dbClient');
const asyncHandler = require('../asyncHandler');
const logger = require('../logger');

const router = Router();
const ENDPOINT = '/api/metas_mensuales';

/**
 * GET /api/metas_mensuales/anios
 * Retorna los años que tienen alguna meta configurada.
 */
router.get('/anios', asyncHandler(ENDPOINT, async (req, res) => {
  const { rows } = await query(`SELECT DISTINCT anio FROM app_ops.metas_mensuales ORDER BY anio ASC`);
  return res.json({ ok: true, data: rows.map(r => r.anio) });
}));

/**
 * GET /api/metas_mensuales
 * Query params:
 *  - anio (required)
 *  - concepto (optional, default: 'ventas')
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const anio = parseInt(req.query.anio, 10);
  const concepto = req.query.concepto || 'ventas';

  if (!anio || isNaN(anio)) {
    return res.status(400).json({ ok: false, error: 'Parámetro "anio" es requerido y debe ser numérico' });
  }

  const { rows } = await query(
    `SELECT id, anio, mes, concepto, valor, modificado_por, modificado_en
     FROM app_ops.metas_mensuales
     WHERE anio = $1 AND concepto = $2
     ORDER BY mes ASC`,
    [anio, concepto]
  );

  return res.json({ ok: true, data: rows });
}));

/**
 * POST /api/metas_mensuales/bulk
 * Body: {
 *   anio: number,
 *   concepto: string (default: 'ventas'),
 *   meses: [{ mes: number, valor: number }, ...]
 * }
 */
router.post('/bulk', asyncHandler(ENDPOINT, async (req, res) => {
  const { anio, concepto = 'ventas', meses } = req.body;
  const modificado_por = req.user?.nombre || req.user?.email || 'Sistema';
  const isAdmin = req.user?.rol === 'admin';

  // Validaciones
  if (!anio || isNaN(anio)) {
    return res.status(400).json({ ok: false, error: 'Año inválido' });
  }
  if (!Array.isArray(meses)) {
    return res.status(400).json({ ok: false, error: 'Se esperaba un arreglo de "meses"' });
  }
  if (concepto !== 'ventas') {
    return res.status(400).json({ ok: false, error: 'Solo se soporta el concepto "ventas" por ahora' });
  }

  const mesesSet = new Set();
  for (const m of meses) {
    if (m.mes < 1 || m.mes > 12) {
      return res.status(400).json({ ok: false, error: `Mes inválido: ${m.mes}` });
    }
    if (mesesSet.has(m.mes)) {
      return res.status(400).json({ ok: false, error: `Mes duplicado: ${m.mes}` });
    }
    if (m.valor < 0 || isNaN(m.valor)) {
      return res.status(400).json({ ok: false, error: `Valor inválido para el mes ${m.mes}` });
    }
    mesesSet.add(m.mes);
  }

  // Protección de meses históricos
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  for (const m of meses) {
    const esHistorico = (anio < anioActual) || (anio === anioActual && m.mes < mesActual);
    if (esHistorico && !isAdmin) {
      return res.status(403).json({ ok: false, error: `El mes ${m.mes}/${anio} es histórico y no puede ser modificado por un usuario normal.` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upsertQuery = `
      INSERT INTO app_ops.metas_mensuales (anio, mes, concepto, valor, modificado_por)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (anio, mes, concepto) DO UPDATE SET
        valor = EXCLUDED.valor,
        modificado_por = EXCLUDED.modificado_por,
        modificado_en = now()
    `;

    for (const m of meses) {
      await client.query(upsertQuery, [anio, m.mes, concepto, m.valor, modificado_por]);
    }

    await client.query('COMMIT');
    logger.info(ENDPOINT, `Metas bulk actualizadas para ${anio} (${concepto}) por ${modificado_por}`);
    return res.json({ ok: true, message: 'Metas actualizadas correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/metas_mensuales/duplicar
 * Body: {
 *   anioOrigen: number,
 *   anioDestino: number,
 *   concepto: string (default: 'ventas'),
 *   force: boolean
 * }
 */
router.post('/duplicar', asyncHandler(ENDPOINT, async (req, res) => {
  const { anioOrigen, anioDestino, concepto = 'ventas', force } = req.body;
  const modificado_por = req.user?.nombre || req.user?.email || 'Sistema';
  const isAdmin = req.user?.rol === 'admin';

  if (!anioOrigen || !anioDestino) {
    return res.status(400).json({ ok: false, error: 'anioOrigen y anioDestino son requeridos' });
  }
  if (force && !isAdmin) {
    return res.status(403).json({ ok: false, error: 'Solo los administradores pueden forzar la duplicación (sobrescribir)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar destino
    const { rows: rowsDestino } = await client.query(
      'SELECT id FROM app_ops.metas_mensuales WHERE anio = $1 AND concepto = $2 LIMIT 1',
      [anioDestino, concepto]
    );

    if (rowsDestino.length > 0 && !force) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'El año destino ya tiene metas. ¿Deseas sobrescribir?', requiresForce: true });
    }

    // Obtener origen
    const { rows: rowsOrigen } = await client.query(
      'SELECT mes, valor FROM app_ops.metas_mensuales WHERE anio = $1 AND concepto = $2',
      [anioOrigen, concepto]
    );

    if (rowsOrigen.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'No se encontraron metas en el año origen' });
    }

    const upsertQuery = `
      INSERT INTO app_ops.metas_mensuales (anio, mes, concepto, valor, modificado_por)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (anio, mes, concepto) DO UPDATE SET
        valor = EXCLUDED.valor,
        modificado_por = EXCLUDED.modificado_por,
        modificado_en = now()
    `;

    for (const r of rowsOrigen) {
      await client.query(upsertQuery, [anioDestino, r.mes, concepto, r.valor, modificado_por]);
    }

    await client.query('COMMIT');
    logger.info(ENDPOINT, `Metas duplicadas de ${anioOrigen} a ${anioDestino} (${concepto}) por ${modificado_por}`);
    return res.json({ ok: true, message: 'Metas duplicadas correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
