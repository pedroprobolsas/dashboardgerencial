'use strict';
const { Router } = require('express');
const { query } = require('../dbClient');
const asyncHandler = require('../asyncHandler');
const cache = require('../cache');
const logger = require('../logger');
const { loadParametrosFromDB } = require('./kpis');
const { diasHabilesEntre } = require('../utils/dateUtils');

const router = Router();
const ENDPOINT = '/api/cartera-clientes';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutos

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function getHoyBogotaDate() {
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [y, m, d] = hoyStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseIsoDateLocal(fechaStr) {
  if (!fechaStr) return null;
  const [y, m, d] = fechaStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatHoraBogota(syncFecha) {
  if (!syncFecha) return null;
  const d = new Date(syncFecha);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Resuelve la fuente de datos (foto actual o histórico por fecha_corte).
 * La fecha de la foto actual siempre se calcula en America/Bogota.
 */
async function resolveSnapshot(fechaParam) {
  if (fechaParam !== undefined && fechaParam !== '') {
    if (!isValidIsoDate(fechaParam)) {
      return { invalid: 'Parámetro fecha inválido. Use formato YYYY-MM-DD' };
    }
    const { rows } = await query(
      `SELECT
         to_char((MAX(_sync_fecha) AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS fecha_actual,
         MAX(_sync_fecha) AS sync_fecha
       FROM crisolweb.cartera_clientes`
    );
    const metaActual = rows[0] || {};
    const coincideActual = metaActual.fecha_actual === fechaParam;
    return {
      esHistorico: true,
      table: 'crisolweb.cartera_clientes_historico',
      whereClause: 'WHERE fecha_corte = $1::date',
      params: [fechaParam],
      fechaFoto: fechaParam,
      syncFecha: coincideActual ? metaActual.sync_fecha : null,
      fechaActual: metaActual.fecha_actual || null,
    };
  }

  const { rows } = await query(
    `SELECT
       to_char((MAX(_sync_fecha) AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS fecha_foto,
       MAX(_sync_fecha) AS sync_fecha
     FROM crisolweb.cartera_clientes`
  );
  const meta = rows[0] || {};
  return {
    esHistorico: false,
    table: 'crisolweb.cartera_clientes',
    whereClause: '',
    params: [],
    fechaFoto: meta.fecha_foto || null,
    syncFecha: meta.sync_fecha || null,
    fechaActual: meta.fecha_foto || null,
  };
}

/**
 * GET /api/cartera-clientes/fechas
 * Lista de fechas disponibles en crisolweb.cartera_clientes_historico (más reciente primero).
 */
router.get('/fechas', asyncHandler(`${ENDPOINT}/fechas`, async (_req, res) => {
  const cacheKey = 'cartera_clientes:fechas';
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`${ENDPOINT}/fechas`, 'Cache HIT');
    return res.json(cached);
  }

  const [{ rows }, { rows: actualRows }] = await Promise.all([
    query(
      `SELECT DISTINCT to_char(fecha_corte, 'YYYY-MM-DD') AS fecha
       FROM crisolweb.cartera_clientes_historico
       ORDER BY fecha DESC`
    ),
    query(
      `SELECT to_char((MAX(_sync_fecha) AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS fecha_actual
       FROM crisolweb.cartera_clientes`
    ),
  ]);

  const resultado = {
    ok: true,
    fecha_actual: actualRows[0]?.fecha_actual || null,
    fechas: rows.map((r) => r.fecha),
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(`${ENDPOINT}/fechas`, `OK — ${resultado.fechas.length} fechas`);
  return res.json(resultado);
}));

/**
 * GET /api/cartera-clientes/resumen?fecha=YYYY-MM-DD
 * Resumen ejecutivo, antigüedad facturas/anticipos, desglose por asesor y cruce SIIGO.
 */
router.get('/resumen', asyncHandler(`${ENDPOINT}/resumen`, async (req, res) => {
  const fechaParam = typeof req.query.fecha === 'string' ? req.query.fecha.trim() : '';
  const cacheKey = `cartera_clientes:resumen:${fechaParam || 'actual'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`${ENDPOINT}/resumen`, `Cache HIT (${fechaParam || 'actual'})`);
    return res.json(cached);
  }

  const fuente = await resolveSnapshot(fechaParam);
  if (fuente.invalid) {
    return res.status(400).json({ ok: false, error: fuente.invalid });
  }

  if (!fuente.fechaFoto) {
    return res.json({
      ok: true,
      fecha_foto: null,
      sync_fecha: null,
      hora_foto: null,
      desactualizado: true,
      es_historico: fuente.esHistorico,
      totales: {
        facturas_cantidad: 0,
        facturas_saldo: 0,
        vencido: 0,
        vencido_cantidad: 0,
        vence_hoy: 0,
        vence_hoy_cantidad: 0,
        por_vencer: 0,
        por_vencer_cantidad: 0,
        anticipos_cantidad: 0,
        anticipos_saldo: 0,
        neto: 0,
      },
      antiguedad_facturas: [],
      antiguedad_anticipos: [],
      por_asesor: [],
      siigo: {
        fecha_siigo: null,
        clientes_1305: 0,
        anticipos_2805: 0,
        diferencia_facturas: 0,
        diferencia_anticipos: 0,
      },
    });
  }

  const queryParams = [fuente.fechaFoto];
  const whereSql = fuente.esHistorico ? 'WHERE fecha_corte = $1::date' : '';
  const whereFacturasSql = fuente.esHistorico
    ? "WHERE fecha_corte = $1::date AND tipo = 'factura'"
    : "WHERE tipo = 'factura'";

  const sqlTotalesYAntiguedad = `
    SELECT
      COUNT(*) FILTER (WHERE tipo = 'factura')::int AS facturas_cantidad,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura'), 0)::float8 AS facturas_saldo,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido > 0), 0)::float8 AS vencido,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido > 0)::int AS vencido_cantidad,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido = 0), 0)::float8 AS vence_hoy,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido = 0)::int AS vence_hoy_cantidad,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido < 0), 0)::float8 AS por_vencer,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido < 0)::int AS por_vencer_cantidad,
      COUNT(*) FILTER (WHERE tipo = 'anticipo')::int AS anticipos_cantidad,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo'), 0)::float8 AS anticipos_saldo,
      COALESCE(SUM(saldo), 0)::float8 AS neto,

      -- Antigüedad facturas por días de mora (dias_vencido)
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 1 AND 30)::int AS f_1_30_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 1 AND 30), 0)::float8 AS f_1_30_saldo,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 31 AND 60)::int AS f_31_60_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 31 AND 60), 0)::float8 AS f_31_60_saldo,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 61 AND 90)::int AS f_61_90_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 61 AND 90), 0)::float8 AS f_61_90_saldo,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 91 AND 180)::int AS f_91_180_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido BETWEEN 91 AND 180), 0)::float8 AS f_91_180_saldo,
      COUNT(*) FILTER (WHERE tipo = 'factura' AND dias_vencido > 180)::int AS f_mas_180_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido > 180), 0)::float8 AS f_mas_180_saldo,

      -- Antigüedad anticipos: fecha_foto - fecha_factura
      COUNT(*) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) <= 30)::int AS a_0_30_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) <= 30), 0)::float8 AS a_0_30_saldo,
      COUNT(*) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) BETWEEN 31 AND 90)::int AS a_31_90_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) BETWEEN 31 AND 90), 0)::float8 AS a_31_90_saldo,
      COUNT(*) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) BETWEEN 91 AND 180)::int AS a_91_180_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) BETWEEN 91 AND 180), 0)::float8 AS a_91_180_saldo,
      COUNT(*) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) BETWEEN 181 AND 365)::int AS a_181_365_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) BETWEEN 181 AND 365), 0)::float8 AS a_181_365_saldo,
      COUNT(*) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) > 365)::int AS a_mas_365_cant,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo' AND ($1::date - fecha_factura::date) > 365), 0)::float8 AS a_mas_365_saldo
    FROM ${fuente.table}
    ${whereSql}
  `;

  const sqlAsesores = `
    SELECT
      COALESCE(vendedor, 'SIN ASESOR') AS asesor,
      COUNT(*)::int AS facturas,
      COALESCE(SUM(saldo), 0)::float8 AS saldo,
      COALESCE(SUM(saldo) FILTER (WHERE dias_vencido > 0), 0)::float8 AS vencido,
      COALESCE(SUM(saldo) FILTER (WHERE dias_vencido > 30), 0)::float8 AS saldo_mas_30
    FROM ${fuente.table}
    ${whereFacturasSql}
    GROUP BY vendedor
    ORDER BY saldo DESC
  `;

  const sqlSiigo = `
    WITH ultima_fecha AS (
      SELECT MAX(fecha) AS fecha
      FROM app_ops.saldos_contables_siigo
      WHERE fecha <= $1::date
        AND (codigo_cuenta LIKE '1305%' OR codigo_cuenta LIKE '2805%')
    )
    SELECT
      to_char(u.fecha, 'YYYY-MM-DD') AS fecha_siigo,
      COALESCE(SUM(s.saldo_final) FILTER (WHERE s.codigo_cuenta LIKE '1305%'), 0)::float8 AS clientes_1305,
      COALESCE(SUM(s.saldo_final) FILTER (WHERE s.codigo_cuenta LIKE '2805%'), 0)::float8 AS anticipos_2805
    FROM ultima_fecha u
    LEFT JOIN app_ops.saldos_contables_siigo s
      ON s.fecha = u.fecha
      AND (s.codigo_cuenta LIKE '1305%' OR s.codigo_cuenta LIKE '2805%')
    GROUP BY u.fecha
  `;

  const [totalesRes, asesoresRes, siigoRes, metas] = await Promise.all([
    query(sqlTotalesYAntiguedad, queryParams),
    query(sqlAsesores, fuente.params),
    query(sqlSiigo, queryParams),
    loadParametrosFromDB(),
  ]);

  const t = totalesRes.rows[0] || {};
  const s = siigoRes.rows[0] || {};

  const fechaReferenciaDesact = fuente.fechaActual || fuente.fechaFoto;
  const diffDias = fechaReferenciaDesact
    ? diasHabilesEntre(parseIsoDateLocal(fechaReferenciaDesact), getHoyBogotaDate())
    : 0;
  const limiteDias = metas['datos_desactualizados_dias'] !== undefined
    ? Number(metas['datos_desactualizados_dias'])
    : 2;

  const facturasSaldo = Number(t.facturas_saldo || 0);
  const anticiposSaldo = Number(t.anticipos_saldo || 0);
  const clientes1305 = Number(s.clientes_1305 || 0);
  const anticipos2805 = Number(s.anticipos_2805 || 0);

  const resultado = {
    ok: true,
    fecha_foto: fuente.fechaFoto,
    sync_fecha: fuente.syncFecha,
    hora_foto: formatHoraBogota(fuente.syncFecha),
    desactualizado: diffDias > limiteDias,
    es_historico: fuente.esHistorico,
    totales: {
      facturas_cantidad: Number(t.facturas_cantidad || 0),
      facturas_saldo: facturasSaldo,
      vencido: Number(t.vencido || 0),
      vencido_cantidad: Number(t.vencido_cantidad || 0),
      vence_hoy: Number(t.vence_hoy || 0),
      vence_hoy_cantidad: Number(t.vence_hoy_cantidad || 0),
      por_vencer: Number(t.por_vencer || 0),
      por_vencer_cantidad: Number(t.por_vencer_cantidad || 0),
      anticipos_cantidad: Number(t.anticipos_cantidad || 0),
      anticipos_saldo: anticiposSaldo,
      neto: Number(t.neto || 0),
    },
    antiguedad_facturas: [
      { rango: 'Por vencer', key: 'por_vencer', cantidad: Number(t.por_vencer_cantidad || 0), saldo: Number(t.por_vencer || 0) },
      { rango: 'Vence hoy', key: 'vence_hoy', cantidad: Number(t.vence_hoy_cantidad || 0), saldo: Number(t.vence_hoy || 0) },
      { rango: '1–30 días', key: '1_30', cantidad: Number(t.f_1_30_cant || 0), saldo: Number(t.f_1_30_saldo || 0) },
      { rango: '31–60 días', key: '31_60', cantidad: Number(t.f_31_60_cant || 0), saldo: Number(t.f_31_60_saldo || 0) },
      { rango: '61–90 días', key: '61_90', cantidad: Number(t.f_61_90_cant || 0), saldo: Number(t.f_61_90_saldo || 0) },
      { rango: '91–180 días', key: '91_180', cantidad: Number(t.f_91_180_cant || 0), saldo: Number(t.f_91_180_saldo || 0) },
      { rango: '> 180 días', key: 'mas_180', cantidad: Number(t.f_mas_180_cant || 0), saldo: Number(t.f_mas_180_saldo || 0) },
    ],
    antiguedad_anticipos: [
      { rango: '0–30 días', key: '0_30', cantidad: Number(t.a_0_30_cant || 0), saldo: Number(t.a_0_30_saldo || 0) },
      { rango: '31–90 días', key: '31_90', cantidad: Number(t.a_31_90_cant || 0), saldo: Number(t.a_31_90_saldo || 0) },
      { rango: '91–180 días', key: '91_180', cantidad: Number(t.a_91_180_cant || 0), saldo: Number(t.a_91_180_saldo || 0) },
      { rango: '181–365 días', key: '181_365', cantidad: Number(t.a_181_365_cant || 0), saldo: Number(t.a_181_365_saldo || 0) },
      { rango: '> 365 días', key: 'mas_365', cantidad: Number(t.a_mas_365_cant || 0), saldo: Number(t.a_mas_365_saldo || 0) },
    ],
    por_asesor: asesoresRes.rows.map((r) => {
      const saldo = Number(r.saldo || 0);
      const vencido = Number(r.vencido || 0);
      return {
        asesor: r.asesor,
        facturas: Number(r.facturas || 0),
        saldo,
        vencido,
        pct_vencido: saldo > 0 ? Number(((vencido / saldo) * 100).toFixed(1)) : 0,
        saldo_mas_30: Number(r.saldo_mas_30 || 0),
      };
    }),
    siigo: {
      fecha_siigo: s.fecha_siigo || null,
      clientes_1305: clientes1305,
      anticipos_2805: anticipos2805,
      diferencia_facturas: facturasSaldo - clientes1305,
      diferencia_anticipos: anticiposSaldo - anticipos2805,
    },
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(`${ENDPOINT}/resumen`, `OK (${fechaParam || 'actual'}) — neto: ${resultado.totales.neto}`);
  return res.json(resultado);
}));

/**
 * GET /api/cartera-clientes/clientes?fecha=YYYY-MM-DD
 * Una fila por NIT + nombre con totales de facturas, vencido, mora máxima, anticipos, neto y cruce_pendiente.
 */
router.get('/clientes', asyncHandler(`${ENDPOINT}/clientes`, async (req, res) => {
  const fechaParam = typeof req.query.fecha === 'string' ? req.query.fecha.trim() : '';
  const cacheKey = `cartera_clientes:clientes:${fechaParam || 'actual'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`${ENDPOINT}/clientes`, `Cache HIT (${fechaParam || 'actual'})`);
    return res.json(cached);
  }

  const fuente = await resolveSnapshot(fechaParam);
  if (fuente.invalid) {
    return res.status(400).json({ ok: false, error: fuente.invalid });
  }

  if (!fuente.fechaFoto) {
    return res.json({ ok: true, fecha_foto: null, clientes: [] });
  }

  const sql = `
    SELECT
      nit_cliente,
      nombre_cliente,
      COUNT(*) FILTER (WHERE tipo = 'factura')::int AS facturas_cantidad,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura'), 0)::float8 AS facturas_saldo,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido > 0), 0)::float8 AS vencido,
      MAX(dias_vencido) FILTER (WHERE tipo = 'factura')::int AS mora_maxima,
      COUNT(*) FILTER (WHERE tipo = 'anticipo')::int AS anticipos_cantidad,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo'), 0)::float8 AS anticipos_saldo,
      COALESCE(SUM(saldo), 0)::float8 AS neto,
      (COUNT(*) FILTER (WHERE tipo = 'factura' AND saldo > 0) > 0
       AND COUNT(*) FILTER (WHERE tipo = 'anticipo') > 0) AS cruce_pendiente
    FROM ${fuente.table}
    ${fuente.whereClause}
    GROUP BY nit_cliente, nombre_cliente
    ORDER BY neto DESC, nombre_cliente ASC
  `;

  const { rows } = await query(sql, fuente.params);
  const resultado = {
    ok: true,
    fecha_foto: fuente.fechaFoto,
    clientes: rows.map((r) => ({
      nit_cliente: r.nit_cliente,
      nombre_cliente: r.nombre_cliente,
      facturas_cantidad: Number(r.facturas_cantidad || 0),
      facturas_saldo: Number(r.facturas_saldo || 0),
      vencido: Number(r.vencido || 0),
      mora_maxima: r.mora_maxima !== null && r.mora_maxima !== undefined ? Number(r.mora_maxima) : null,
      anticipos_cantidad: Number(r.anticipos_cantidad || 0),
      anticipos_saldo: Number(r.anticipos_saldo || 0),
      neto: Number(r.neto || 0),
      cruce_pendiente: Boolean(r.cruce_pendiente),
    })),
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(`${ENDPOINT}/clientes`, `OK (${fechaParam || 'actual'}) — ${resultado.clientes.length} clientes`);
  return res.json(resultado);
}));

/**
 * GET /api/cartera-clientes/documentos?fecha=YYYY-MM-DD
 * Todas las filas de la foto con fechas YYYY-MM-DD y antigüedad calculada contra fecha_foto en anticipos.
 */
router.get('/documentos', asyncHandler(`${ENDPOINT}/documentos`, async (req, res) => {
  const fechaParam = typeof req.query.fecha === 'string' ? req.query.fecha.trim() : '';
  const cacheKey = `cartera_clientes:documentos:${fechaParam || 'actual'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`${ENDPOINT}/documentos`, `Cache HIT (${fechaParam || 'actual'})`);
    return res.json(cached);
  }

  const fuente = await resolveSnapshot(fechaParam);
  if (fuente.invalid) {
    return res.status(400).json({ ok: false, error: fuente.invalid });
  }

  if (!fuente.fechaFoto) {
    return res.json({ ok: true, fecha_foto: null, documentos: [] });
  }

  const whereSql = fuente.esHistorico ? 'WHERE fecha_corte = $1::date' : '';
  const sql = `
    SELECT
      tipo,
      nit_cliente,
      nombre_cliente,
      nro_factura,
      to_char(fecha_factura, 'YYYY-MM-DD') AS fecha_factura,
      to_char(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
      COALESCE(dias_vencido, 0)::int AS dias_vencido,
      CASE
        WHEN tipo = 'factura' THEN COALESCE(dias_vencido, 0)::int
        ELSE ($1::date - fecha_factura::date)::int
      END AS antiguedad_dias,
      COALESCE(valor_total, 0)::float8 AS valor_total,
      COALESCE(saldo, 0)::float8 AS saldo,
      vendedor
    FROM ${fuente.table}
    ${whereSql}
    ORDER BY tipo ASC, dias_vencido DESC, saldo DESC
  `;

  const { rows } = await query(sql, [fuente.fechaFoto]);
  const resultado = {
    ok: true,
    fecha_foto: fuente.fechaFoto,
    documentos: rows.map((r) => ({
      tipo: r.tipo,
      nit_cliente: r.nit_cliente,
      nombre_cliente: r.nombre_cliente,
      nro_factura: r.nro_factura,
      fecha_factura: r.fecha_factura || null,
      fecha_vencimiento: r.fecha_vencimiento || null,
      dias_vencido: Number(r.dias_vencido || 0),
      antiguedad_dias: Number(r.antiguedad_dias || 0),
      valor_total: Number(r.valor_total || 0),
      saldo: Number(r.saldo || 0),
      vendedor: r.vendedor || null,
    })),
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(`${ENDPOINT}/documentos`, `OK (${fechaParam || 'actual'}) — ${resultado.documentos.length} docs`);
  return res.json(resultado);
}));

/**
 * GET /api/cartera-clientes/tendencia?desde=&hasta=
 * Serie diaria por fecha_corte en crisolweb.cartera_clientes_historico.
 */
router.get('/tendencia', asyncHandler(`${ENDPOINT}/tendencia`, async (req, res) => {
  const desde = typeof req.query.desde === 'string' ? req.query.desde.trim() : '';
  const hasta = typeof req.query.hasta === 'string' ? req.query.hasta.trim() : '';

  if (desde && !isValidIsoDate(desde)) {
    return res.status(400).json({ ok: false, error: 'Parámetro desde inválido (use YYYY-MM-DD)' });
  }
  if (hasta && !isValidIsoDate(hasta)) {
    return res.status(400).json({ ok: false, error: 'Parámetro hasta inválido (use YYYY-MM-DD)' });
  }

  const cacheKey = `cartera_clientes:tendencia:${desde}:${hasta}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`${ENDPOINT}/tendencia`, `Cache HIT (${desde}..${hasta})`);
    return res.json(cached);
  }

  const conds = [];
  const params = [];
  if (desde) {
    params.push(desde);
    conds.push(`fecha_corte >= $${params.length}::date`);
  }
  if (hasta) {
    params.push(hasta);
    conds.push(`fecha_corte <= $${params.length}::date`);
  }
  const whereSql = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

  const sql = `
    SELECT
      to_char(fecha_corte, 'YYYY-MM-DD') AS fecha,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura'), 0)::float8 AS facturas_saldo,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'factura' AND dias_vencido > 0), 0)::float8 AS vencido,
      COALESCE(SUM(saldo) FILTER (WHERE tipo = 'anticipo'), 0)::float8 AS anticipos_saldo,
      COALESCE(SUM(saldo), 0)::float8 AS neto,
      COUNT(*)::int AS documentos
    FROM crisolweb.cartera_clientes_historico
    ${whereSql}
    GROUP BY fecha_corte
    ORDER BY fecha_corte ASC
  `;

  const { rows } = await query(sql, params);
  const resultado = {
    ok: true,
    serie: rows.map((r) => ({
      fecha: r.fecha,
      facturas_saldo: Number(r.facturas_saldo || 0),
      vencido: Number(r.vencido || 0),
      anticipos_saldo: Number(r.anticipos_saldo || 0),
      neto: Number(r.neto || 0),
      documentos: Number(r.documentos || 0),
    })),
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(`${ENDPOINT}/tendencia`, `OK — ${resultado.serie.length} días`);
  return res.json(resultado);
}));

function buildTotalesPorTipoLista(docs) {
  const facturas = docs.filter((d) => d.tipo === 'factura');
  const anticipos = docs.filter((d) => d.tipo === 'anticipo');
  return {
    cantidad: docs.length,
    facturas: {
      cantidad: facturas.length,
      saldo: facturas.reduce((acc, d) => acc + d.saldo, 0),
    },
    anticipos: {
      cantidad: anticipos.length,
      saldo: anticipos.reduce((acc, d) => acc + d.saldo, 0),
    },
  };
}

function buildTotalesCambiaron(docs) {
  const sumarGrupo = (grupo) => ({
    cantidad: grupo.length,
    saldo_antes: grupo.reduce((acc, d) => acc + d.saldo_antes, 0),
    saldo_despues: grupo.reduce((acc, d) => acc + d.saldo_despues, 0),
    diferencia: grupo.reduce((acc, d) => acc + d.diferencia, 0),
  });
  return {
    cantidad: docs.length,
    facturas: sumarGrupo(docs.filter((d) => d.tipo === 'factura')),
    anticipos: sumarGrupo(docs.filter((d) => d.tipo === 'anticipo')),
  };
}

function buildEmptyCambiosResponse(desde, hasta, mensaje) {
  return {
    ok: true,
    desde,
    hasta,
    mensaje,
    salieron: [],
    entraron: [],
    cambiaron_saldo: [],
    totales: {
      salieron: buildTotalesPorTipoLista([]),
      entraron: buildTotalesPorTipoLista([]),
      cambiaron_saldo: buildTotalesCambiaron([]),
    },
  };
}

function extractCambiosCampos(r, saldoAntes, saldoDespues) {
  const cambios = [];
  if (saldoAntes !== saldoDespues) {
    cambios.push({
      campo: 'saldo',
      etiqueta: 'Saldo',
      antes: saldoAntes,
      despues: saldoDespues,
    });
  }
  const camposTexto = [
    { campo: 'nit_cliente', etiqueta: 'NIT', antes: r.nit_antes, despues: r.nit_despues, fallback: '—' },
    { campo: 'nombre_cliente', etiqueta: 'Cliente', antes: r.nombre_antes, despues: r.nombre_despues, fallback: '—' },
    { campo: 'vendedor', etiqueta: 'Asesor', antes: r.vendedor_antes, despues: r.vendedor_despues, fallback: 'SIN ASESOR' },
    { campo: 'fecha_vencimiento', etiqueta: 'Vence', antes: r.fecha_vencimiento_antes, despues: r.fecha_vencimiento_despues, fallback: '—' },
  ];
  for (const cfg of camposTexto) {
    const vAntes = cfg.antes ?? null;
    const vDespues = cfg.despues ?? null;
    if (vAntes !== vDespues) {
      cambios.push({
        campo: cfg.campo,
        etiqueta: cfg.etiqueta,
        antes: vAntes || cfg.fallback,
        despues: vDespues || cfg.fallback,
      });
    }
  }
  return cambios;
}

/**
 * GET /api/cartera-clientes/cambios?desde=&hasta=
 * Compara dos fotos del histórico por (tipo, nro_factura).
 */
router.get('/cambios', asyncHandler(`${ENDPOINT}/cambios`, async (req, res) => {
  const desdeReq = typeof req.query.desde === 'string' ? req.query.desde.trim() : '';
  const hastaReq = typeof req.query.hasta === 'string' ? req.query.hasta.trim() : '';

  if (desdeReq && !isValidIsoDate(desdeReq)) {
    return res.status(400).json({ ok: false, error: 'Parámetro desde inválido (use YYYY-MM-DD)' });
  }
  if (hastaReq && !isValidIsoDate(hastaReq)) {
    return res.status(400).json({ ok: false, error: 'Parámetro hasta inválido (use YYYY-MM-DD)' });
  }

  const cacheKey = `cartera_clientes:cambios:${desdeReq || 'auto'}:${hastaReq || 'auto'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`${ENDPOINT}/cambios`, `Cache HIT (${desdeReq || 'auto'}..${hastaReq || 'auto'})`);
    return res.json(cached);
  }

  let desde = desdeReq;
  let hasta = hastaReq;

  if (!desde || !hasta) {
    const { rows: fechasRows } = await query(
      `SELECT DISTINCT to_char(fecha_corte, 'YYYY-MM-DD') AS fecha
       FROM crisolweb.cartera_clientes_historico
       ORDER BY fecha DESC`
    );
    const fechas = fechasRows.map((r) => r.fecha);

    if (fechas.length < 2) {
      const vacio = buildEmptyCambiosResponse(null, fechas[0] || null, 'Se necesita al menos dos fechas para comparar');
      cache.set(cacheKey, vacio, CACHE_TTL);
      return res.json(vacio);
    }

    if (!hasta) hasta = fechas[0];
    if (!desde) {
      const anterior = fechas.find((f) => f < hasta);
      if (!anterior) {
        const vacio = buildEmptyCambiosResponse(null, hasta, 'Se necesita al menos dos fechas para comparar');
        cache.set(cacheKey, vacio, CACHE_TTL);
        return res.json(vacio);
      }
      desde = anterior;
    }
  }

  const sql = `
    WITH foto_desde AS (
      SELECT tipo, nro_factura, nit_cliente, nombre_cliente,
             to_char(fecha_factura, 'YYYY-MM-DD') AS fecha_factura,
             to_char(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
             dias_vencido, saldo, vendedor
      FROM crisolweb.cartera_clientes_historico
      WHERE fecha_corte = $1::date
    ),
    foto_hasta AS (
      SELECT tipo, nro_factura, nit_cliente, nombre_cliente,
             to_char(fecha_factura, 'YYYY-MM-DD') AS fecha_factura,
             to_char(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
             dias_vencido, saldo, vendedor
      FROM crisolweb.cartera_clientes_historico
      WHERE fecha_corte = $2::date
    )
    SELECT
      CASE
        WHEN a.nro_factura IS NOT NULL AND b.nro_factura IS NULL THEN 'salio'
        WHEN a.nro_factura IS NULL AND b.nro_factura IS NOT NULL THEN 'entro'
        ELSE 'cambio'
      END AS estado_cambio,
      COALESCE(b.tipo, a.tipo) AS tipo,
      COALESCE(b.nro_factura, a.nro_factura) AS nro_factura,
      COALESCE(b.nit_cliente, a.nit_cliente) AS nit_cliente,
      COALESCE(b.nombre_cliente, a.nombre_cliente) AS nombre_cliente,
      COALESCE(b.fecha_factura, a.fecha_factura) AS fecha_factura,
      COALESCE(b.fecha_vencimiento, a.fecha_vencimiento) AS fecha_vencimiento,
      COALESCE(b.vendedor, a.vendedor) AS vendedor,
      a.nit_cliente AS nit_antes,
      b.nit_cliente AS nit_despues,
      a.nombre_cliente AS nombre_antes,
      b.nombre_cliente AS nombre_despues,
      a.vendedor AS vendedor_antes,
      b.vendedor AS vendedor_despues,
      a.fecha_vencimiento AS fecha_vencimiento_antes,
      b.fecha_vencimiento AS fecha_vencimiento_despues,
      COALESCE(a.saldo, 0)::float8 AS saldo_antes,
      COALESCE(b.saldo, 0)::float8 AS saldo_despues,
      (COALESCE(b.saldo, 0) - COALESCE(a.saldo, 0))::float8 AS diferencia
    FROM foto_desde a
    FULL OUTER JOIN foto_hasta b
      ON a.tipo = b.tipo AND a.nro_factura = b.nro_factura
    WHERE a.nro_factura IS NULL
       OR b.nro_factura IS NULL
       OR COALESCE(a.saldo, 0) IS DISTINCT FROM COALESCE(b.saldo, 0)
       OR a.nit_cliente IS DISTINCT FROM b.nit_cliente
       OR a.nombre_cliente IS DISTINCT FROM b.nombre_cliente
       OR a.vendedor IS DISTINCT FROM b.vendedor
       OR a.fecha_vencimiento IS DISTINCT FROM b.fecha_vencimiento
    ORDER BY ABS(COALESCE(b.saldo, 0) - COALESCE(a.saldo, 0)) DESC,
             COALESCE(b.tipo, a.tipo) ASC,
             COALESCE(b.nro_factura, a.nro_factura) ASC
  `;

  const { rows } = await query(sql, [desde, hasta]);

  const salieron = [];
  const entraron = [];
  const cambiaronSaldo = [];

  for (const r of rows) {
    const base = {
      tipo: r.tipo,
      nro_factura: r.nro_factura,
      nit_cliente: r.nit_cliente,
      nombre_cliente: r.nombre_cliente,
      fecha_factura: r.fecha_factura || null,
      fecha_vencimiento: r.fecha_vencimiento || null,
      vendedor: r.vendedor || null,
    };
    if (r.estado_cambio === 'salio') {
      salieron.push({ ...base, saldo: Number(r.saldo_antes || 0) });
    } else if (r.estado_cambio === 'entro') {
      entraron.push({ ...base, saldo: Number(r.saldo_despues || 0) });
    } else {
      const saldoAntes = Number(r.saldo_antes || 0);
      const saldoDespues = Number(r.saldo_despues || 0);
      cambiaronSaldo.push({
        ...base,
        saldo_antes: saldoAntes,
        saldo_despues: saldoDespues,
        diferencia: Number(r.diferencia || 0),
        cambios: extractCambiosCampos(r, saldoAntes, saldoDespues),
      });
    }
  }

  const resultado = {
    ok: true,
    desde,
    hasta,
    mensaje: null,
    salieron,
    entraron,
    cambiaron_saldo: cambiaronSaldo,
    totales: {
      salieron: buildTotalesPorTipoLista(salieron),
      entraron: buildTotalesPorTipoLista(entraron),
      cambiaron_saldo: buildTotalesCambiaron(cambiaronSaldo),
    },
  };

  cache.set(cacheKey, resultado, CACHE_TTL);
  logger.info(`${ENDPOINT}/cambios`, `OK (${desde} -> ${hasta}) — salieron: ${salieron.length}, entraron: ${entraron.length}, cambios: ${cambiaronSaldo.length}`);
  return res.json(resultado);
}));

module.exports = router;
