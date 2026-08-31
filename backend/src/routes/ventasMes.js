'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const cache         = require('../cache');
const logger        = require('../logger');

const router  = Router();
const ENDPOINT = '/api/ventas_mes';

/**
 * GET /api/ventas_mes
 *
 * Devuelve las facturas de crisolweb.facturas filtradas por rango de fechas,
 * con un resumen agregado y el detalle por factura.
 *
 * Query params:
 *   fecha_inicio – ISO date (YYYY-MM-DD). Requerido.
 *   fecha_fin    – ISO date (YYYY-MM-DD). Requerido.
 *   limit        – Máximo de filas en detalle (default: 500, máx: 1000).
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha_inicio, fecha_fin, limit: limitParam } = req.query;

  // ── Validación ────────────────────────────────────────────────────────
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

  const limit = Math.min(Math.max(parseInt(limitParam) || 500, 1), 1000);

  // ── Cache ─────────────────────────────────────────────────────────────
  const cacheKey = `ventas_mes:${fecha_inicio}:${fecha_fin}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT', { fecha_inicio, fecha_fin });
    return res.json(cached);
  }

  const anio = parseInt(fecha_inicio.substring(0, 4), 10);
  const mes = parseInt(fecha_inicio.substring(5, 7), 10);

  // ── Queries en paralelo: resumen + detalle + meta ─────────────────────
  const [resumenResult, detalleResult, metasResult] = await Promise.all([
    query(
      `SELECT
         COUNT(*)              AS facturas,
         COALESCE(ROUND(SUM(valor_bruto), 2), 0) AS total_bruto,
         COALESCE(ROUND(SUM(valor_iva), 2), 0)   AS total_iva,
         COALESCE(ROUND(SUM(valor_neto), 2), 0)  AS total_neto
       FROM crisolweb.facturas
       WHERE fecha_creacion >= $1::date
         AND fecha_creacion <= $2::date
         AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))`,
      [fecha_inicio, fecha_fin]
    ),
    query(
      `SELECT
         consecutivo, nombre AS cliente, fecha_creacion AS fecha,
         ROUND(valor_bruto, 2) AS valor_bruto,
         ROUND(valor_iva, 2)   AS valor_iva,
         ROUND(valor_neto, 2)  AS valor_neto,
         estado
       FROM crisolweb.facturas
       WHERE fecha_creacion >= $1::date
         AND fecha_creacion <= $2::date
         AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))
       ORDER BY fecha_creacion DESC
       LIMIT $3`,
      [fecha_inicio, fecha_fin, limit]
    ),
    query(
      `SELECT valor FROM app_ops.metas_mensuales WHERE anio = $1 AND mes = $2 AND concepto = 'ventas'`,
      [anio, mes]
    ),
  ]);

  const resumen = resumenResult.rows[0] || {};
  const metaRow = metasResult.rows[0];
  const metaVentas = metaRow ? parseFloat(metaRow.valor) : 0;

  const { loadParametrosFromDB } = require('./kpis');
  const { diasHabilesEntre } = require('../utils/dateUtils');
  const metas = await loadParametrosFromDB();

  const maxDateResult = await query(`SELECT MAX(fecha_creacion)::date as max_date FROM crisolweb.facturas`);
  const maxDate = maxDateResult.rows[0]?.max_date;
  const diffDias = maxDate ? diasHabilesEntre(maxDate, new Date()) : 0;
  const limiteDias = metas['datos_desactualizados_dias'] !== undefined ? Number(metas['datos_desactualizados_dias']) : 2;

  const resultado = {
    ok:      true,
    filtros: { fecha_inicio, fecha_fin, limit },
    meta_ventas: metaVentas,
    resumen: {
      facturas:    parseInt(resumen.facturas || 0, 10),
      total_bruto: parseFloat(resumen.total_bruto || 0),
      total_iva:   parseFloat(resumen.total_iva   || 0),
      total_neto:  parseFloat(resumen.total_neto  || 0),
    },
    total:   detalleResult.rows.length,
    detalle: detalleResult.rows,
    fechaActualizacion: maxDate,
    desactualizado: diffDias > limiteDias,
  };

  // Guardar en cache (5 min)
  cache.set(cacheKey, resultado);
  logger.info(ENDPOINT, `OK — ${resultado.resumen.facturas} facturas`, { fecha_inicio, fecha_fin });

  return res.json(resultado);
}));

module.exports = router;
