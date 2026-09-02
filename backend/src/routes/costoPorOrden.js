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
  const parsedMargen = parseFloat(margen_minimo);
  const umbral = !isNaN(parsedMargen) ? parsedMargen : 12.5;

  // ── Cache ─────────────────────────────────────────────────────────────
  const cacheKey = `costo_por_orden:${fecha_inicio}:${fecha_fin}:${umbral}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT', { fecha_inicio, fecha_fin, umbral });
    return res.json(cached);
  }

  // ── Queries a PostgreSQL ─────────────────────────────────────────────
  const sqlMaxFecha = `SELECT MAX(fecha) AS ultima_actualizacion FROM crisolweb.costo_por_orden`;
  
  const sqlResumen = `
    SELECT
      COUNT(*) AS total_ops,
      ROUND(AVG(margen_pct), 2) AS margen_promedio,
      ROUND(SUM(valor_cumplido), 2) AS valor_facturado,
      SUM(CASE WHEN margen_pct < $3 THEN 1 ELSE 0 END) AS ops_bajo_umbral
    FROM crisolweb.costo_por_orden
    WHERE fecha >= $1::date
      AND fecha <= $2::date
      AND valor_cumplido > 0
  `;

  const sqlDetalle = `
    SELECT
      nro_op,
      cliente,
      referencia,
      ROUND(costo_total_estimado,   2)                                              AS costo_total_estimado,
      ROUND(costo_ejecutado_total,  2)                                              AS costo_ejecutado_total,
      ROUND(valor_cumplido, 2)                                                      AS valor_cumplido,
      margen_pct,
      fecha
    FROM crisolweb.costo_por_orden
    WHERE fecha >= $1::date
      AND fecha <= $2::date
      AND valor_cumplido > 0
      AND margen_pct < $3
    ORDER BY fecha DESC, margen_pct ASC
  `;

  const sqlSinValorizar = `
    SELECT COUNT(*) AS ops_sin_valorizar
    FROM crisolweb.ordenes_cumplidas
    WHERE fecha_cumplimiento >= $1::date
      AND fecha_cumplimiento <= $2::date
      AND (
        NOT EXISTS (
          SELECT 1 FROM crisolweb.costo_por_orden cpo 
          WHERE cpo.nro_op = crisolweb.ordenes_cumplidas.nro_orden
        )
      )
  `;

  const [maxFechaResult, resumenResult, detalleResult, sinValorizarResult] = await Promise.all([
    query(sqlMaxFecha),
    query(sqlResumen, [fecha_inicio, fecha_fin, umbral]),
    query(sqlDetalle, [fecha_inicio, fecha_fin, umbral]),
    query(sqlSinValorizar, [fecha_inicio, fecha_fin])
  ]);

  const maxFecha = maxFechaResult.rows[0]?.ultima_actualizacion || null;
  const resumen = resumenResult.rows[0] || {};
  const rows = detalleResult.rows;
  const opsSinValorizar = parseInt(sinValorizarResult.rows[0]?.ops_sin_valorizar || 0, 10);

  const resultado = {
    ok:            true,
    filtros:       { fecha_inicio, fecha_fin, margen_minimo: umbral },
    resumen: {
      ultima_actualizacion: maxFecha,
      total_ops:           parseInt(resumen.total_ops || 0, 10),
      margen_promedio:     parseFloat(resumen.margen_promedio || 0),
      valor_facturado:     parseFloat(resumen.valor_facturado || 0),
      ops_bajo_umbral:     parseInt(resumen.ops_bajo_umbral || 0, 10),
      ops_sin_valorizar:   opsSinValorizar,
    },
    total:         rows.length,
    ordenes:       rows,
  };

  // Guardar en cache (5 min)
  cache.set(cacheKey, resultado);
  logger.info(ENDPOINT, `OK — ${resultado.resumen.total_ops} OPs en periodo, ${rows.length} críticas`, { fecha_inicio, fecha_fin });

  return res.json(resultado);
}));

/**
 * GET /api/costo_por_orden/:nro_op
 *
 * Devuelve el detalle (trazabilidad) de una OP específica.
 */
router.get('/:nro_op', asyncHandler(`${ENDPOINT}/:nro_op`, async (req, res) => {
  const { nro_op } = req.params;

  const sqlCabecera = `
    SELECT
      nro_op, cliente, referencia, fecha, margen_pct,
      cantidad_cotizada AS op_cantidad_cotizada,
      cantidad_ejecutada AS op_cantidad_ejecutada
    FROM crisolweb.costo_por_orden
    WHERE nro_op = $1
    LIMIT 1
  `;

  const sqlDetalle = `
    SELECT
      item,
      categoria,
      ROUND(cant_cotizada, 2) AS cant_cotizada,
      ROUND(cant_ejecutada, 2) AS cant_ejecutada,
      ROUND(valor_cotizado, 2) AS valor_cotizado,
      ROUND(valor_ejecutado, 2) AS valor_ejecutado,
      ROUND(cumplimiento, 2) AS cumplimiento,
      
      -- Diferencia horas % (positivo = se usaron más horas = sobrecosto)
      CASE 
        WHEN cant_cotizada > 0 THEN ROUND(((cant_ejecutada - cant_cotizada) / cant_cotizada) * 100, 2) 
        ELSE NULL 
      END AS diferencia_pct,
      
      -- Efectos (Multiplicados por -1 para que Ahorro = Positivo, Sobrecosto = Negativo)
      ROUND((cant_cotizada - cant_ejecutada) * (valor_cotizado / NULLIF(cant_cotizada, 0)), 2) AS efecto_horas,
      ROUND(((valor_cotizado / NULLIF(cant_cotizada, 0)) - (valor_ejecutado / NULLIF(cant_ejecutada, 0))) * cant_ejecutada, 2) AS efecto_tarifa
      
    FROM crisolweb.costo_por_orden_detalle
    WHERE nro_op = $1
    ORDER BY categoria, item
  `;

  const [cabeceraResult, detalleResult] = await Promise.all([
    query(sqlCabecera, [nro_op]),
    query(sqlDetalle, [nro_op])
  ]);

  if (cabeceraResult.rows.length === 0) {
    return res.status(404).json({ ok: false, error: 'OP no encontrada' });
  }

  return res.json({
    ok: true,
    cabecera: cabeceraResult.rows[0],
    detalle: detalleResult.rows,
  });
}));

module.exports = router;
