'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const cache         = require('../cache');
const logger        = require('../logger');

const router   = Router();
const ENDPOINT = '/api/cartera_por_asesor';

/**
 * GET /api/cartera_por_asesor
 *
 * Devuelve la cartera de clientes agrupada por asesor/vendedor,
 * con desglose de saldo vencido vs corriente.
 *
 * Query params:
 *   fecha_corte – ISO date (YYYY-MM-DD). Informativo (la tabla es snapshot).
 *
 * Nota: crisolweb.cartera_vendedor es un snapshot que se actualiza en cada
 * sincronización. No tiene columna de fecha, así que fecha_corte es solo
 * para contexto en la respuesta.
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha_corte } = req.query;

  // ── Cache (2 min — tabla es snapshot, no cambia constantemente) ────────
  const CACHE_TTL = 2 * 60 * 1000;
  const cacheKey  = 'cartera_por_asesor';
  const cached    = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT');
    // Incluir fecha_corte del request actual en la respuesta cacheada
    return res.json({ ...cached, fecha_corte: fecha_corte || cached.fecha_corte });
  }

  // ── Query ─────────────────────────────────────────────────────────────
  const [{ rows }, maxDateResult] = await Promise.all([
    query(
      `SELECT
         COALESCE(vendedor, 'SIN ASESOR') AS asesor,
         COUNT(*)                          AS facturas,
         ROUND(SUM(saldo), 0)             AS saldo_total,
         ROUND(SUM(CASE WHEN dias_vencido > 0  THEN saldo ELSE 0 END), 0) AS vencido,
         ROUND(SUM(CASE WHEN dias_vencido <= 0 THEN saldo ELSE 0 END), 0) AS corriente
       FROM crisolweb.cartera_vendedor
       WHERE saldo > 0
       GROUP BY vendedor
       ORDER BY saldo_total DESC`
    ),
    query(`SELECT MAX(_sync_fecha)::date as max_date FROM crisolweb.cartera_vendedor`)
  ]);

  // ── Calcular totales ──────────────────────────────────────────────────
  const totalSaldo     = rows.reduce((s, r) => s + parseFloat(r.saldo_total || 0), 0);
  const totalVencido   = rows.reduce((s, r) => s + parseFloat(r.vencido     || 0), 0);
  const totalCorriente = rows.reduce((s, r) => s + parseFloat(r.corriente   || 0), 0);
  const pctVencido     = totalSaldo > 0 ? parseFloat((totalVencido / totalSaldo * 100).toFixed(1)) : 0;

  const { loadParametrosFromDB } = require('./kpis');
  const { diasHabilesEntre } = require('../utils/dateUtils');
  const metas = await loadParametrosFromDB();

  const maxDate = maxDateResult.rows[0]?.max_date;
  const diffDias = maxDate ? diasHabilesEntre(maxDate, new Date()) : 0;
  const limiteDias = metas['datos_desactualizados_dias'] !== undefined ? Number(metas['datos_desactualizados_dias']) : 2;

  const resultado = {
    ok:          true,
    fecha_corte: fecha_corte || new Date().toISOString().split('T')[0],
    resumen: {
      total:       totalSaldo,
      vencido:     totalVencido,
      corriente:   totalCorriente,
      pct_vencido: pctVencido,
    },
    total:    rows.length,
    asesores: rows.map(r => ({
      asesor:      r.asesor,
      facturas:    parseInt(r.facturas || 0, 10),
      saldo_total: parseFloat(r.saldo_total || 0),
      vencido:     parseFloat(r.vencido     || 0),
      corriente:   parseFloat(r.corriente   || 0),
    })),
    fechaActualizacion: maxDate,
    desactualizado: diffDias > limiteDias,
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(ENDPOINT, `OK — ${rows.length} asesores, total: ${totalSaldo}`);

  return res.json(resultado);
}));

module.exports = router;
