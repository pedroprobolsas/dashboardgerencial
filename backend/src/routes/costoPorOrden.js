'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const cache         = require('../cache');
const logger        = require('../logger');

const router   = Router();
const ENDPOINT = '/api/costo_por_orden';

/**
 * GET /api/costo_por_orden
 *
 * Devuelve las órdenes de producción de crisolweb.costo_por_orden
 * filtradas por rango de fechas y margen máximo.
 *
 * Query params:
 *   fecha_inicio  – ISO date (YYYY-MM-DD). Requerido.
 *   fecha_fin     – ISO date (YYYY-MM-DD). Requerido.
 *   margen_minimo – Umbral de margen máximo a incluir (%). Default: 12.5
 *                   Solo se devuelven OPs cuyo margen_pct < este valor.
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha_inicio, fecha_fin, margen_minimo } = req.query;

  // ── Validación de parámetros obligatorios ──────────────────────────
  if (!fecha_inicio || !fecha_fin) {
    return res.status(400).json({
      ok: false,
      error: 'Parámetros requeridos: fecha_inicio y fecha_fin (YYYY-MM-DD)',
    });
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(fecha_inicio) || !isoDate.test(fecha_fin)) {
    return res.status(400).json({
      ok: false,
      error: 'Formato de fecha inválido. Usa YYYY-MM-DD.',
    });
  }

  if (fecha_inicio > fecha_fin) {
    return res.status(400).json({
      ok: false,
      error: 'fecha_inicio no puede ser mayor que fecha_fin.',
    });
  }

  // Umbral de margen: solo OPs con margen_pct < este valor
  const umbral = parseFloat(margen_minimo) || 12.5;

  // ── Cache ─────────────────────────────────────────────────────────────
  const cacheKey = `costo_por_orden:${fecha_inicio}:${fecha_fin}:${umbral}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT', { fecha_inicio, fecha_fin, umbral });
    return res.json(cached);
  }

  // ── Query a PostgreSQL ─────────────────────────────────────────────
  const sql = `
    SELECT
      nro_op,
      cliente,
      referencia,
      ROUND(costo_total,   2)                                               AS costo_total,
      ROUND(valor_cumplido, 2)                                              AS valor_cumplido,
      ROUND(100.0 * (valor_cumplido - costo_total) / NULLIF(valor_cumplido, 0), 2) AS margen_pct,
      fecha
    FROM crisolweb.costo_por_orden
    WHERE fecha >= $1::date
      AND fecha <= $2::date
      AND valor_cumplido > 0
      AND (100.0 * (valor_cumplido - costo_total) / NULLIF(valor_cumplido, 0)) < $3
    ORDER BY margen_pct ASC
  `;

  const { rows } = await query(sql, [fecha_inicio, fecha_fin, umbral]);

  const resultado = {
    ok:            true,
    filtros:       { fecha_inicio, fecha_fin, margen_minimo: umbral },
    total:         rows.length,
    ordenes:       rows,
  };

  // Guardar en cache (5 min)
  cache.set(cacheKey, resultado);
  logger.info(ENDPOINT, `OK — ${rows.length} OPs con margen < ${umbral}%`, { fecha_inicio, fecha_fin });

  return res.json(resultado);
}));

module.exports = router;
