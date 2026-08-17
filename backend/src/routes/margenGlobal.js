'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const cache         = require('../cache');
const logger        = require('../logger');

const router   = Router();
const ENDPOINT = '/api/margen_global';

/**
 * GET /api/margen_global
 *
 * Calcula el margen de caja global: (ventas_neto - egresos) / ventas_neto * 100
 * usando crisolweb.facturas y analytics.v_vistazo_diario.
 *
 * Query params:
 *   fecha_inicio – ISO date (YYYY-MM-DD). Requerido.
 *   fecha_fin    – ISO date (YYYY-MM-DD). Requerido.
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;

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

  // ── Cache ─────────────────────────────────────────────────────────────
  const cacheKey = `margen_global:${fecha_inicio}:${fecha_fin}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT', { fecha_inicio, fecha_fin });
    return res.json(cached);
  }

  // ── Queries en paralelo: ventas netas + egresos ───────────────────────
  const [ventasResult, egresosResult] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(valor_neto), 0) AS total_ventas
       FROM crisolweb.facturas
       WHERE fecha_creacion >= $1::date
         AND fecha_creacion <= $2::date
         AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))`,
      [fecha_inicio, fecha_fin]
    ),
    query(
      `SELECT COALESCE(SUM(total_egresos), 0) AS total_egresos
       FROM crisolweb.egresos_agrupados_concepto
       WHERE fecha_contable >= $1::date
         AND fecha_contable <= $2::date`,
      [fecha_inicio, fecha_fin]
    ),
  ]);

  const ventas  = parseFloat(ventasResult.rows[0]?.total_ventas  || 0);
  const egresos = parseFloat(egresosResult.rows[0]?.total_egresos || 0);

  const fmt = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });

  if (egresos === 0 || ventas === 0) {
    const resultado = {
      ok: true,
      filtros: { fecha_inicio, fecha_fin },
      ventas,
      ventas_fmt: fmt.format(ventas),
      egresos,
      egresos_fmt: fmt.format(egresos),
      margen_absoluto: ventas - egresos,
      margen_absoluto_fmt: fmt.format(ventas - egresos),
      margen_pct: null,
      alerta: 'gris',
      sinDatos: true,
      detalle: egresos === 0 ? 'Sin datos de egresos' : 'Sin datos de ventas'
    };
    cache.set(cacheKey, resultado);
    return res.json(resultado);
  }

  const margenAbsoluto = ventas - egresos;
  const margenPct      = parseFloat((margenAbsoluto / ventas * 100).toFixed(2));

  // Semáforo: ≥35% verde, ≥25% amarillo, <25% rojo
  let alerta = 'rojo';
  if (margenPct >= 35) alerta = 'verde';
  else if (margenPct >= 25) alerta = 'amarillo';

  const resultado = {
    ok:      true,
    filtros: { fecha_inicio, fecha_fin },
    ventas:          ventas,
    ventas_fmt:      fmt.format(ventas),
    egresos:         egresos,
    egresos_fmt:     fmt.format(egresos),
    margen_absoluto:     margenAbsoluto,
    margen_absoluto_fmt: fmt.format(margenAbsoluto),
    margen_pct:      margenPct,
    alerta,
  };

  cache.set(cacheKey, resultado);
  logger.info(ENDPOINT, `OK — margen: ${margenPct}%`, { fecha_inicio, fecha_fin, ventas, egresos });

  return res.json(resultado);
}));

module.exports = router;
