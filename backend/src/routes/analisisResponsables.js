'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const cache         = require('../cache');
const logger        = require('../logger');

const router   = Router();
const ENDPOINT = '/api/analisis_responsables';

/**
 * GET /api/analisis_responsables
 *
 * Devuelve el detalle de variaciones de costo para responsables (Jesús y Cristian)
 * filtradas por rango de fechas, cruzando costo_por_orden con costo_por_orden_detalle
 * y aislando categoria = 'mano_obra'.
 *
 * Query params:
 *   fecha_inicio  – ISO date (YYYY-MM-DD). Requerido.
 *   fecha_fin     – ISO date (YYYY-MM-DD). Requerido.
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;

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

  // ── Cache ─────────────────────────────────────────────────────────────
  const cacheKey = `analisis_responsables:${fecha_inicio}:${fecha_fin}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT', { fecha_inicio, fecha_fin });
    return res.json(cached);
  }

  // ── Query a PostgreSQL ─────────────────────────────────────────────
  const sql = `
    SELECT
      d.nro_op,
      d.referencia,
      d.item AS actividad,
      ROUND(d.cant_cotizada, 2) AS cant_cotizada,
      ROUND(d.cant_ejecutada, 2) AS cant_ejecutada,
      ROUND(d.valor_cotizado, 2) AS valor_cotizado,
      ROUND(d.valor_ejecutado, 2) AS valor_ejecutado,
      ROUND(d.cumplimiento, 2) AS cumplimiento,
      
      ROUND(d.cant_ejecutada - d.cant_cotizada, 2) AS diferencia_horas,
      CASE 
        WHEN d.cant_cotizada > 0 THEN ROUND(((d.cant_ejecutada - d.cant_cotizada) / d.cant_cotizada) * 100, 2) 
        ELSE NULL 
      END AS diferencia_horas_pct,
      
      ROUND(d.valor_cotizado / NULLIF(d.cant_cotizada, 0), 2) AS tarifa_cotizada,
      ROUND(d.valor_ejecutado / NULLIF(d.cant_ejecutada, 0), 2) AS tarifa_real,
      
      ROUND((d.cant_cotizada - d.cant_ejecutada) * (d.valor_cotizado / NULLIF(d.cant_cotizada, 0)), 2) AS efecto_horas,
      ROUND(((d.valor_cotizado / NULLIF(d.cant_cotizada, 0)) - (d.valor_ejecutado / NULLIF(d.cant_ejecutada, 0))) * d.cant_ejecutada, 2) AS efecto_tarifa
      
    FROM crisolweb.costo_por_orden_detalle d
    JOIN crisolweb.costo_por_orden o ON d.nro_op = o.nro_op AND d.referencia = o.referencia
    WHERE o.fecha >= $1::date
      AND o.fecha <= $2::date
      AND d.categoria = 'mano_obra'
    ORDER BY d.nro_op DESC
  `;

  const { rows } = await query(sql, [fecha_inicio, fecha_fin]);

  let jesus_total_efecto_horas = 0;
  let cristian_total_efecto_tarifa = 0;

  // Calculamos los totales agregados omitiendo los nulos (sin cotizar)
  for (const r of rows) {
    if (r.efecto_horas !== null) jesus_total_efecto_horas += parseFloat(r.efecto_horas);
    if (r.efecto_tarifa !== null) cristian_total_efecto_tarifa += parseFloat(r.efecto_tarifa);
  }

  const resultado = {
    ok:            true,
    filtros:       { fecha_inicio, fecha_fin },
    indicadores: {
      jesus_efecto_horas: jesus_total_efecto_horas,
      cristian_efecto_tarifa: cristian_total_efecto_tarifa,
    },
    total:         rows.length,
    detalle:       rows,
  };

  // Guardar en cache (5 min)
  cache.set(cacheKey, resultado);
  logger.info(ENDPOINT, `OK — ${rows.length} líneas de mano de obra`, { fecha_inicio, fecha_fin });

  return res.json(resultado);
}));

module.exports = router;
