'use strict';
const express = require('express');
const router = express.Router();
const { readRange, appendRow, createSheetIfMissing } = require('../sheetsClient');
const { query } = require('../dbClient');

const SP1 = process.env.SPREADSHEET_ID_1;
const SP2 = process.env.SPREADSHEET_ID_2;

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Metas desde Google Sheets con fallback a .env ─────────────────────────────

const ENV_METAS = {
  meta_ventas_mes:        parseFloat(process.env.META_VENTAS                  || '450000000'),
  ventas_pct_verde:       parseFloat(process.env.META_VENTAS_PCT_VERDE        || '90'),
  ventas_pct_amarillo:    parseFloat(process.env.META_VENTAS_PCT_AMARILLO     || '80'),
  // Margen de caja
  meta_margen_caja:       parseFloat(process.env.META_MARGEN_VERDE            || '35'),
  margen_amarillo:        parseFloat(process.env.META_MARGEN_AMARILLO         || '25'),
  // Cartera / proveedores
  cartera_vencida_alerta: parseFloat(process.env.META_CARTERA_ALERTA_ROJA     || '40'),
  cartera_vencida_alerta_amarilla: parseFloat(process.env.META_CARTERA_ALERTA_AMARILLA || '20'),
  cartera_verde:          parseFloat(process.env.META_CARTERA_VERDE           || '30000000'),
  cartera_amarillo:       parseFloat(process.env.META_CARTERA_AMARILLO        || '50000000'),
  cartera_vencida_max:    parseFloat(process.env.META_CARTERA_MAX             || '30000000'),
  // Flujo de caja
  flujo_verde:            parseFloat(process.env.META_FLUJO_VERDE             || '50000000'),
  // Eficiencia producción
  meta_margen_produccion: parseFloat(process.env.META_MARGEN_PRODUCCION       || '18'),
  // Rotación personal
  rotacion_personal_max:  parseFloat(process.env.META_ROTACION               || '5'),
  // Cierres
  meta_aprobaciones_cierre: parseFloat(process.env.META_CIERRE                  || '5'),
  cierre_verde:           parseFloat(process.env.META_CIERRE_VERDE            || '100'),
  cierre_amarillo:        parseFloat(process.env.META_CIERRE_AMARILLO         || '60'),
};

/**
 * Lee la configuración de la base de datos app_ops.parametros
 * a una fecha específica, para que el reporte sea coherente con 
 * lo que estaba vigente en ese momento.
 */
async function loadParametrosFromDB(fecha = null) {
  try {
    let sql;
    let params = [];
    
    if (fecha) {
      sql = `
        SELECT clave, valor
        FROM app_ops.parametros
        WHERE vigente_desde <= $1::date 
          AND (vigente_hasta IS NULL OR vigente_hasta > $1::date)
      `;
      params.push(fecha);
    } else {
      sql = `
        SELECT clave, valor
        FROM app_ops.parametros
        WHERE vigente_hasta IS NULL
      `;
    }
    
    const { rows } = await query(sql, params);
    const mapa = {};
    rows.forEach(r => {
      mapa[r.clave] = parseFloat(r.valor);
    });
    return mapa;
  } catch (err) {
    console.error('loadParametrosFromDB error (usando .env como respaldo):', err.message);
    return {};
  }
}

/** Devuelve el valor de la meta: primero busca en DB, luego usa .env/default. */
function getMeta(metasDB, key) {
  return metasDB[key] !== undefined ? metasDB[key] : ENV_METAS[key];
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parsea "YYYY-MM" → { mesLabel: 'marzo', anio: 2026, mesNum: 3 } */
function parsePeriodo(periodo) {
  const [y, m] = (periodo || mesActual()).split('-').map(Number);
  return { anio: y, mesNum: m, mesLabel: MESES[m - 1] };
}

function alertaColor(valor, umbrales) {
  if (umbrales.verde(valor)) return 'verde';
  if (umbrales.amarillo(valor)) return 'amarillo';
  return 'rojo';
}

// ── Utilidad: parsear números en formato colombiano ("1.234.567,89") ──────────
// Los puntos son separadores de miles, la coma es el decimal.

function parseCOP(val) {
  if (!val) return 0;
  const limpio = String(val).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(limpio) || 0;
}

// ── Utilidad: parsear porcentaje ("24%" o "35.72%") ───────────────────────────
// El punto ES el decimal — no usar parseCOP aquí.

function parsePct(val) {
  if (!val) return null;
  const s = String(val).replace('%', '').replace(',', '.').trim();
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

/** Extrae el año de una celda de fecha: "3/24/2026", "2026-03-24", "24/03/2026", etc. */
function extraerAnio(val) {
  if (!val) return null;
  const s = String(val).trim();
  // Formato MM/DD/YYYY (Google Sheets US)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return parseInt(mdy[3], 10);
  // Formato YYYY-MM-DD
  const iso = s.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return parseInt(iso[1], 10);
  // Formato DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return parseInt(dmy[3], 10);
  // Intentar Date.parse como último recurso
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

// ── KPI: % Cierre mensual completado ─────────────────────────────────────────

async function kpiCierreMensual(periodo, metas = {}) {
  try {
    const filas = await readRange(SP1, 'Informes_cierre_mensual!A:I');
    if (filas.length <= 1) return { valor: 0, valorFormateado: '0%', fuente: 'real', detalle: 'Sin registros' };

    const headers = filas[0];
    const iPeriodo = headers.indexOf('Período');
    const iEstado  = headers.indexOf('Estado');

    if (iPeriodo === -1 || iEstado === -1) {
      return { valor: 0, valorFormateado: '0%', fuente: 'error', detalle: 'Columnas Período/Estado no encontradas' };
    }

    const datos = filas.slice(1).filter(f => f[iPeriodo] === periodo);
    const aprobados = datos.filter(f => f[iEstado] === 'APROBADO').length;
    const total = getMeta(metas, 'meta_aprobaciones_cierre') || 5;
    const pct = Math.round((aprobados / total) * 100);

    return {
      valor: pct,
      valorFormateado: `${pct}%`,
      meta: `${aprobados} de ${total} aprobados`,
      fuente: 'real',
      alerta: alertaColor(pct, {
        verde:    v => v >= getMeta(metas, 'cierre_verde'),
        amarillo: v => v >= getMeta(metas, 'cierre_amarillo'),
      }),
    };
  } catch (err) {
    console.error('kpiCierreMensual error:', err.message);
    return { valor: null, fuente: 'error', detalle: err.message };
  }
}

/**
 * Calcula días hábiles de un mes (lunes a viernes).
 * Encapsulado para futura incorporación de festivos de Colombia.
 */
function calcularDiasHabiles(anio, mesNum) {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  
  const esMesActual = anio === anioActual && mesNum === mesActual;
  const esMesPasado = anio < anioActual || (anio === anioActual && mesNum < mesActual);
  const esMesFuturo = anio > anioActual || (anio === anioActual && mesNum > mesActual);
  
  const fechaFin = new Date(anio, mesNum, 0); // último día del mes
  const diasTotalesMes = fechaFin.getDate();
  
  let habilesTotales = 0;
  let habilesTranscurridos = 0;
  
  const diaTope = esMesActual ? hoy.getDate() : esMesPasado ? diasTotalesMes : 0;
  
  for (let d = 1; d <= diasTotalesMes; d++) {
    const fecha = new Date(anio, mesNum - 1, d);
    const diaSemana = fecha.getDay(); // 0 = Dom, 6 = Sab
    const esHabil = diaSemana !== 0 && diaSemana !== 6;
    
    if (esHabil) {
      habilesTotales++;
      if (d <= diaTope) {
        habilesTranscurridos++;
      }
    }
  }
  
  if (habilesTotales === 0) habilesTotales = 1;
  if (habilesTranscurridos === 0 && esMesActual) habilesTranscurridos = 1;

  return { transcurridos: habilesTranscurridos, totales: habilesTotales, esMesActual, esMesPasado, esMesFuturo };
}

// ── KPI: Ventas del mes vs meta ───────────────────────────────────────────────

async function kpiVentasMeta({ mesNum, anio }, metas = {}) {
  try {
    const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
    
    const [ventasResult, metasResult, maxDateResult] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(valor_bruto), 0) AS total_bruto,
                COALESCE(SUM(valor_iva), 0)   AS total_iva,
                COALESCE(SUM(valor_neto), 0)  AS total_neto,
                COUNT(*)         AS facturas
         FROM crisolweb.facturas
         WHERE fecha_creacion >= $1::date
           AND fecha_creacion <  ($1::date + INTERVAL '1 month')
           AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))`,
        [primerDiaMes]
      ),
      query(
        `SELECT valor FROM app_ops.metas_mensuales WHERE anio = $1 AND mes = $2 AND concepto = 'ventas'`,
        [anio, mesNum]
      ),
      query('SELECT MAX(fecha_creacion)::date as max_date FROM crisolweb.facturas')
    ]);

    const rows = ventasResult.rows;
    const facturas = parseInt(rows[0]?.facturas || 0, 10);
    const maxDate = maxDateResult.rows[0]?.max_date;
    const diffDias = maxDate ? Math.floor((new Date() - new Date(maxDate)) / (1000 * 60 * 60 * 24)) : 0;
    const limiteDias = getMeta(metas, 'datos_desactualizados_dias') || 2;

    const metaRow = metasResult.rows[0];
    const tieneMeta = !!metaRow;
    const metaVentas = tieneMeta ? parseFloat(metaRow.valor) : 0;

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    if (facturas === 0) {
      return { 
        fuente: 'real', 
        sinDatos: true, 
        valor: 0, 
        valorFormateado: '—', 
        meta: tieneMeta ? `Meta: ${fmt.format(metaVentas)}` : 'Meta no configurada', 
        alerta: tieneMeta ? 'amarillo' : 'gris', 
        fechaActualizacion: maxDate, 
        desactualizado: diffDias > limiteDias 
      };
    }

    const bruto = parseFloat(rows[0]?.total_bruto || 0);
    const iva   = parseFloat(rows[0]?.total_iva   || 0);
    const neto  = parseFloat(rows[0]?.total_neto  || 0);

    if (!tieneMeta || metaVentas === 0) {
      return {
        fuente: 'real',
        valor: null,
        valorFormateado: '—',
        valorAbsoluto: fmt.format(bruto),
        valorBruto:    fmt.format(bruto),
        valorIva:      fmt.format(iva),
        valorNetoTotal: fmt.format(neto),
        meta: 'Meta no configurada',
        fechaActualizacion: maxDate,
        desactualizado: diffDias > limiteDias,
        alerta: 'gris',
      };
    }

    const pct = Math.round((bruto / metaVentas) * 100);
    
    const { transcurridos, totales, esMesActual } = calcularDiasHabiles(anio, mesNum);
    let metaTexto = `Meta: ${fmt.format(metaVentas)}`;
    
    if (esMesActual) {
      const proyectado = Math.round((bruto / metaVentas) / (transcurridos / totales) * 100);
      metaTexto += ` | ${pct}% con ${transcurridos} de ${totales} días hábiles (proyectado ${proyectado}%)`;
    }

    return {
      fuente: 'real',
      valor: pct,
      valorFormateado: `${pct}%`,
      valorAbsoluto: fmt.format(bruto),
      valorBruto:    fmt.format(bruto),
      valorIva:      fmt.format(iva),
      valorNetoTotal: fmt.format(neto),
      meta: metaTexto,
      fechaActualizacion: maxDate,
      desactualizado: diffDias > limiteDias,
      alerta: alertaColor(pct, {
        verde:    v => v >= getMeta(metas, 'ventas_pct_verde'),
        amarillo: v => v >= getMeta(metas, 'ventas_pct_amarillo'),
      }),
    };
  } catch (err) {
    console.error('kpiVentasMeta:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Margen de caja % ────────────────────────────────────────────────────
// Margen de caja = (Ventas_neto - Egresos_mes) / Ventas_neto × 100
// Ventas: crisolweb.facturas (valor_neto, sin anulados; SIN filtro valor_neto>0
//         para incluir notas crédito negativas y dar el neto real)
// Egresos: analytics.v_vistazo_diario (egresos_mes_acum — evita duplicados
//          de egresos_agrupados_concepto que mezcla filas mensuales y diarias)

async function kpiMargenCaja({ mesNum, anio }, metas = {}) {
  try {
    const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
    const mesStr       = `${anio}-${String(mesNum).padStart(2, '0')}`;

    const [{ rows: rowsV }, { rows: rowsE }] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(valor_neto), 0) AS total
         FROM crisolweb.facturas
         WHERE fecha_creacion >= $1::date
           AND fecha_creacion <  ($1::date + INTERVAL '1 month')
           AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))`,
        [primerDiaMes]
      ),
      query(
        `SELECT COALESCE(SUM(total_egresos), 0) AS total
         FROM crisolweb.egresos_agrupados_concepto
         WHERE fecha_contable >= $1::date
           AND fecha_contable <  ($1::date + INTERVAL '1 month')`,
        [primerDiaMes]
      ),
    ]);

    const ventas  = parseFloat(rowsV[0]?.total || 0);
    const egresos = parseFloat(rowsE[0]?.total || 0);
    const margen  = ventas - egresos;
    const pct     = ventas !== 0 ? parseFloat((margen / ventas * 100).toFixed(1)) : null;

    if (ventas === 0 || egresos === 0 || pct === null || isNaN(pct)) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', alerta: 'gris', detalle: egresos === 0 ? 'Sin datos de egresos' : 'Sin datos de ventas' };
    }

    const fmt           = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const umbralVerde   = getMeta(metas, 'meta_margen_caja');
    const umbralAmari   = getMeta(metas, 'margen_amarillo');

    return {
      fuente: 'real',
      valor: pct,
      valorFormateado: `${pct}%`,
      valorAbsoluto: fmt.format(margen),
      detalle: `Ventas: ${fmt.format(ventas)} | Egresos: ${fmt.format(egresos)}`,
      meta: `Meta: ≥ ${umbralVerde}%`,
      alerta: alertaColor(pct, {
        verde:    v => v >= umbralVerde,
        amarillo: v => v >= umbralAmari,
      }),
    };
  } catch (err) {
    console.error('kpiMargenCaja:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Cuentas por Cobrar por Asesor ───────────────────────────────────────
// Snapshot de cartera_vendedor (se actualiza completa en cada sync).
// Muestra total + top asesores por saldo, con desglose vencido/corriente.

async function kpiCarteraPorAsesor(metas = {}) {
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(vendedor, 'TOTAL') AS vendedor,
         COUNT(*)                                                             AS facturas,
         ROUND(SUM(saldo), 0)                                                AS saldo_total,
         ROUND(SUM(CASE WHEN dias_vencido > 0  THEN saldo ELSE 0 END), 0)   AS vencido,
         ROUND(SUM(CASE WHEN dias_vencido <= 0 THEN saldo ELSE 0 END), 0)   AS corriente
       FROM crisolweb.cartera_vendedor
       WHERE saldo > 0
       GROUP BY ROLLUP(vendedor)
       ORDER BY saldo_total DESC NULLS LAST`
    );

    const totalRow = rows.find(r => r.vendedor === 'TOTAL');
    if (!totalRow) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', alerta: 'amarillo' };
    }

    const total    = parseFloat(totalRow.saldo_total || 0);
    const vencido  = parseFloat(totalRow.vencido     || 0);
    const corriente = parseFloat(totalRow.corriente  || 0);
    const vencidoPct = total > 0 ? (vencido / total * 100) : 0;

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    const topAsesores = rows
      .filter(r => r.vendedor !== 'TOTAL')
      .slice(0, 4)
      .map(r => ({
        nombre:  r.vendedor,
        saldo:   fmt.format(parseFloat(r.saldo_total || 0)),
        vencido: fmt.format(parseFloat(r.vencido     || 0)),
      }));

    return {
      fuente:         'real',
      valor:          total,
      valorFormateado: fmt.format(total),
      meta:           `Vencido: ${fmt.format(vencido)} (${vencidoPct.toFixed(1)}%)`,
      detalle:        `Vencido: ${fmt.format(vencido)} | Corriente: ${fmt.format(corriente)}`,
      vencidoRaw:     vencido,
      corrienteRaw:   corriente,
      topAsesores,
      alerta: alertaColor(vencidoPct, {
        verde:    v => v <= (getMeta(metas, 'cartera_vencida_alerta_amarilla') || 20),
        amarillo: v => v <= (getMeta(metas, 'cartera_vencida_alerta') || 40),
      }),
    };
  } catch (err) {
    console.error('kpiCarteraPorAsesor:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Flujo de caja disponible ─────────────────────────────────────────────

async function kpiFlujoCaja({ mesNum, anio }, metas = {}) {
  try {
    const { rows } = await query(
      `SELECT flujo_caja_disponible, fecha, cuentas_incluidas
       FROM app_ops.v_flujo_caja_disponible
       ORDER BY fecha DESC
       LIMIT 1`
    );

    if (!rows[0] || rows[0].flujo_caja_disponible == null) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', meta: 'Sin datos', alerta: 'gris' };
    }

    const { rows: rowsCuentas } = await query(
      `SELECT codigo_cuenta, nombre_cuenta, saldo
       FROM app_ops.saldos_cuentas_diarios
       WHERE fecha = (SELECT MAX(fecha) FROM app_ops.saldos_cuentas_diarios)
       ORDER BY saldo DESC`
    );

    const flujo = parseFloat(rows[0].flujo_caja_disponible);
    const cuentas = parseInt(rows[0].cuentas_incluidas, 10);
    const fmt   = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    
    // Convertir fecha de UTC a YYYY-MM-DD para el frontend (evitar problemas de timezone)
    const fechaObj = new Date(rows[0].fecha);
    const fechaActualizacion = fechaObj.toISOString().split('T')[0];

    let nota = '';
    if (cuentas < 9) {
      nota = `(⚠️ Solo ${cuentas}/9 cuentas)`;
    }

    const cuentasDesglose = rowsCuentas.map(r => ({
      nombre: r.nombre_cuenta,
      saldo: fmt.format(parseFloat(r.saldo || 0))
    }));

    return {
      fuente: 'real',
      valor: flujo,
      valorFormateado: fmt.format(flujo),
      meta: 'Alerta si es negativo',
      detalle: nota,
      alerta: alertaColor(flujo, {
        verde:    v => v > 0,
        amarillo: v => v === 0,
      }),
      cuentasIncluidas: cuentas,
      cuentasDesglose,
      fechaActualizacion // Para que el frontend lo use y formatee con su timezone correcta
    };
  } catch (err) {
    console.error('kpiFlujoCaja:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Producción desde costo_por_orden (PostgreSQL) ───────────────────────

async function kpiOrdenesCumplidas({ mesNum, anio }, metas = {}) {
  try {
    const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
    
    // Leer umbrales, permitiendo que sean 0 explícitamente
    const metaTol = getMeta(metas, 'atraso_dias_tolerancia');
    const umbralTolerancia = metaTol !== null && metaTol !== undefined ? Number(metaTol) : 2;
    
    const metaCrit = getMeta(metas, 'atraso_dias_critico');
    const umbralCritico = metaCrit !== null && metaCrit !== undefined ? Number(metaCrit) : 10;

    const { rows } = await query(
      `SELECT
         COUNT(*)                                                                        AS total_ops,
         ROUND(AVG(cantidad_cumplida / NULLIF(cantidad_pedida,0) * 100), 1)             AS cumplimiento_prom_pct,
         
         COUNT(*) FILTER (
           WHERE dias_vencido < 0 AND ABS(dias_vencido) > $2 AND ABS(dias_vencido) <= $3
         )                                                                               AS ops_atrasadas,
         
         COUNT(*) FILTER (
           WHERE dias_vencido < 0 AND ABS(dias_vencido) > $3
         )                                                                               AS ops_criticas,
         
         SUM(CASE WHEN dias_vencido < 0 THEN ABS(dias_vencido) ELSE 0 END)             AS total_dias_atraso,
         
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'nro_op', nro_orden,
             'cliente', cliente,
             'referencia', referencia,
             'dias_atraso', ABS(dias_vencido)
           )
         ) FILTER (WHERE dias_vencido < 0 AND ABS(dias_vencido) > $2) AS lista_ops_problema,
         
         MAX(fecha_cumplimiento)::date as max_date
         
       FROM crisolweb.ordenes_cumplidas
       WHERE fecha_cumplimiento >= $1::date
         AND fecha_cumplimiento <  ($1::date + INTERVAL '1 month')`,
      [primerDiaMes, umbralTolerancia, umbralCritico]
    );

    const totalOps      = parseInt(rows[0]?.total_ops         || 0, 10);
    const cumplimiento  = rows[0]?.cumplimiento_prom_pct !== null
                          ? parseFloat(rows[0].cumplimiento_prom_pct)
                          : null;
    const opsCriticas   = parseInt(rows[0]?.ops_criticas      || 0, 10);
    const totalAtraso   = parseInt(rows[0]?.total_dias_atraso || 0, 10);
    const opsAtrasadas  = parseInt(rows[0]?.ops_atrasadas     || 0, 10);
    const listaProblema = rows[0]?.lista_ops_problema         || [];
    
    const maxDate = rows[0]?.max_date;
    const diffDias = maxDate ? Math.floor((new Date() - new Date(maxDate)) / (1000 * 60 * 60 * 24)) : 0;
    const limiteDias = getMeta(metas, 'datos_desactualizados_dias') || 2;

    if (totalOps === 0 || cumplimiento === null) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', alerta: 'amarillo' };
    }

    const pctCriticas = totalOps > 0 ? (opsCriticas / totalOps * 100) : 0;
    
    let colorAlerta = 'verde';
    
    // Forzar amarillo si hay OPs atrasadas pero no críticas
    if (opsAtrasadas > 0) {
      colorAlerta = 'amarillo';
    }
    
    // Forzar rojo si hay 1 o más OPs críticas
    if (opsCriticas > 0) {
      colorAlerta = 'rojo';
    }

    return {
      fuente:          'real',
      valor:           cumplimiento,
      valorFormateado: `${cumplimiento}%`,
      ordenes:         totalOps,
      opsCriticas,
      opsAtrasadas,
      totalDiasAtraso: totalAtraso,
      listaProblema,
      meta:            `Meta: Atraso tol. ${umbralTolerancia}d | OPs: ${totalOps}`,
      detalle:         `Críticas: ${opsCriticas} OPs | Atrasadas: ${opsAtrasadas} OPs`,
      umbralCritico:   umbralCritico,
      alerta:          colorAlerta,
      fechaActualizacion: maxDate,
      desactualizado: diffDias > limiteDias,
    };
  } catch (err) {
    console.error('kpiOrdenesCumplidas:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Costo de Producción (margen_pct desde crisolweb.costo_por_orden) ────

async function kpiCostoProduccion({ mesNum, anio }, metas = {}) {
  try {
    const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
    const margenMinimo = getMeta(metas, 'meta_margen_produccion') || 18;
    const { rows } = await query(
      `SELECT
         COUNT(*)                                AS ops_mes,
         ROUND(AVG(margen_pct), 1)              AS margen_promedio_pct,
         ROUND(SUM(costo_ejecutado_total), 0)             AS total_costo_ejecutado,
         ROUND(SUM(valor_cumplido), 0)          AS total_facturado,
         COUNT(*) FILTER (WHERE margen_pct < 0) AS ops_perdida_real,
         SUM(costo_ejecutado_total - valor_cumplido) FILTER (WHERE margen_pct < 0) AS valor_perdida_real,
         COUNT(*) FILTER (WHERE margen_pct >= 0 AND margen_pct < $2) AS ops_bajo_meta
       FROM crisolweb.costo_por_orden
       WHERE fecha >= $1::date
         AND fecha <  ($1::date + INTERVAL '1 month')
         AND costo_ejecutado_total > 0`,
      [primerDiaMes, margenMinimo]
    );

    const { rows: rowsMax } = await query('SELECT MAX(fecha)::date as max_date FROM crisolweb.costo_por_orden');
    const maxDate = rowsMax[0]?.max_date;
    const diffDias = maxDate ? Math.floor((new Date() - new Date(maxDate)) / (1000 * 60 * 60 * 24)) : 0;
    const limiteDias = getMeta(metas, 'datos_desactualizados_dias') || 2;

    const opsMes        = parseInt(rows[0]?.ops_mes              || 0, 10);
    const margenProm    = rows[0]?.margen_promedio_pct !== null
                          ? parseFloat(rows[0].margen_promedio_pct)
                          : null;
    const totalCosto    = parseFloat(rows[0]?.total_costo_ejecutado || 0);
    const totalFact     = parseFloat(rows[0]?.total_facturado       || 0);
    const opsPerdidaReal = parseInt(rows[0]?.ops_perdida_real      || 0, 10);
    const valorPerdidaReal = parseFloat(rows[0]?.valor_perdida_real || 0);
    const opsBajoMeta    = parseInt(rows[0]?.ops_bajo_meta         || 0, 10);

    if (opsMes === 0 || margenProm === null) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', alerta: 'amarillo', fechaActualizacion: maxDate, desactualizado: diffDias > limiteDias };
    }

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const opsConPerdida = opsPerdidaReal + opsBajoMeta; // Total bajo la meta
    const pctPerdida = (opsConPerdida / opsMes) * 100;
    
    const umbralAmarillo = getMeta(metas, 'ops_perdida_alerta_amarilla') || 10;
    const umbralRojo     = getMeta(metas, 'ops_perdida_alerta_roja')     || 20;

    return {
      fuente:          'real',
      valor:           valorPerdidaReal,
      valorFormateado: `${fmt.format(valorPerdidaReal)}`,
      ordenes:         opsMes,
      margenProm,
      opsPerdidaReal,
      valorPerdidaRealFormateado: fmt.format(valorPerdidaReal),
      opsBajoMeta,
      opsConPerdida,
      pctPerdida,
      costoEjecutado:  fmt.format(totalCosto),
      valorProducido:  fmt.format(totalFact),
      detalle:         `OPs: ${opsMes} | Rentabilidad prom: ${margenProm}% | Meta: ${margenMinimo}%`,
      metaMargenProduccion: margenMinimo,
      fechaActualizacion: maxDate,
      desactualizado: diffDias > limiteDias,
      alerta: alertaColor(pctPerdida, {
        verde:    v => v < umbralAmarillo,
        amarillo: v => v < umbralRojo,
      }),
    };
  } catch (err) {
    console.error('kpiCostoProduccion:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Calidad de Registro (% OPs limpias) ──────────────────────────────────
async function kpiCalidadRegistro({ mesNum, anio }, metas = {}) {
  try {
    const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
    // An OP is "limpia" if it has NO special cases (items executed but not quoted or vice versa)
    const sqlTotal = `SELECT COUNT(DISTINCT nro_op) as total_ops FROM crisolweb.costo_por_orden WHERE fecha >= $1::date AND fecha < ($1::date + INTERVAL '1 month')`;
    
    const sqlSucias = `
      SELECT COUNT(DISTINCT d.nro_op) as ops_sucias
      FROM crisolweb.costo_por_orden_detalle d
      JOIN crisolweb.costo_por_orden o ON d.nro_op = o.nro_op AND d.referencia = o.referencia
      WHERE o.fecha >= $1::date AND o.fecha < ($1::date + INTERVAL '1 month')
        AND (d.cant_cotizada = 0 OR d.cant_ejecutada = 0)
    `;
    
    const [{rows: tRows}, {rows: sRows}, {rows: maxRows}] = await Promise.all([
      query(sqlTotal, [primerDiaMes]),
      query(sqlSucias, [primerDiaMes]),
      query('SELECT MAX(fecha)::date as max_date FROM crisolweb.costo_por_orden')
    ]);
    
    const maxDate = maxRows[0]?.max_date;
    const diffDias = maxDate ? Math.floor((new Date() - new Date(maxDate)) / (1000 * 60 * 60 * 24)) : 0;
    const limiteDias = getMeta(metas, 'datos_desactualizados_dias') || 2;
    
    const totalOps = parseInt(tRows[0]?.total_ops || 0, 10);
    const opsSucias = parseInt(sRows[0]?.ops_sucias || 0, 10);
    
    if (totalOps === 0) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', alerta: 'amarillo', fechaActualizacion: maxDate, desactualizado: diffDias > limiteDias };
    }
    
    const opsLimpias = totalOps - opsSucias;
    const pctLimpias = (opsLimpias / totalOps) * 100;
    
    const metaLimpias = getMeta(metas, 'meta_ops_limpias') || 80;
    
    return {
      fuente: 'real',
      valor: pctLimpias,
      valorFormateado: `${pctLimpias.toFixed(1)}%`,
      detalle: `OPs Limpias: ${opsLimpias} | Con casos especiales: ${opsSucias}`,
      meta: `Meta: ≥ ${metaLimpias}%`,
      fechaActualizacion: maxDate,
      desactualizado: diffDias > limiteDias,
      alerta: pctLimpias >= metaLimpias ? 'verde' : pctLimpias >= (metaLimpias - 10) ? 'amarillo' : 'rojo',
    };
  } catch(e) {
    return { fuente: 'error', detalle: e.message };
  }
}

// ── KPI: Obligaciones por vencer (desde crisolweb.cartera_por_pagar) ──────────
// dias_vencido > 0  → ya vencida (días de mora)
// dias_vencido <= 0 → por vencer (negativo = días restantes hasta el vencimiento)
// No filtra por período: liquidez en tiempo real.

async function kpiObligacionesPorVencer() {
  try {
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    const [{ rows: totales }, { rows: topRows }] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(saldo), 0)                                                        AS total,
          COALESCE(SUM(CASE WHEN dias_vencido > 0              THEN saldo ELSE 0 END), 0) AS vencido,
          COALESCE(SUM(CASE WHEN dias_vencido BETWEEN -15 AND 0 THEN saldo ELSE 0 END), 0) AS d15,
          COALESCE(SUM(CASE WHEN dias_vencido BETWEEN -30 AND -16 THEN saldo ELSE 0 END), 0) AS d30,
          COALESCE(SUM(CASE WHEN dias_vencido BETWEEN -60 AND -31 THEN saldo ELSE 0 END), 0) AS d60,
          COALESCE(SUM(CASE WHEN dias_vencido < -60             THEN saldo ELSE 0 END), 0) AS d60plus
        FROM crisolweb.cartera_por_pagar
        WHERE saldo > 0
      `),
      query(`
        SELECT nombre, SUM(saldo) AS monto
        FROM crisolweb.cartera_por_pagar
        WHERE saldo > 0
        GROUP BY nombre
        ORDER BY monto DESC
        LIMIT 5
      `),
    ]);

    const total          = parseFloat(totales[0]?.total   || 0);
    const totalVencido   = parseFloat(totales[0]?.vencido || 0);
    const d15            = parseFloat(totales[0]?.d15     || 0);
    const d30            = parseFloat(totales[0]?.d30     || 0);
    const d60            = parseFloat(totales[0]?.d60     || 0);
    const d60plus        = parseFloat(totales[0]?.d60plus || 0);
    const totalPorVencer = d15 + d30 + d60 + d60plus;

    const topProveedores = topRows.map(r => ({
      nombre: r.nombre,
      monto:  fmt.format(parseFloat(r.monto || 0)),
    }));

    return {
      fuente:               'real',
      valor:                total,
      valorFormateado:      fmt.format(total),
      meta:                 'Total obligaciones activas',
      totalPorVencer:       fmt.format(totalPorVencer),
      totalVencidoPorPagar: fmt.format(totalVencido),
      desgloseVencimientos: {
        vencido: fmt.format(totalVencido),
        d15:     fmt.format(d15),
        d30:     fmt.format(d30),
        d60:     fmt.format(d60),
        d60plus: fmt.format(d60plus),
      },
      topProveedores,
      totalVencidoRaw: totalVencido,
      d15Raw:          d15,
      d30Raw:          d30,
      alerta: alertaColor(totalVencido, {
        verde:    v => v <= 0,
        amarillo: v => v <= 10_000_000,
      }),
    };
  } catch (err) {
    console.error('kpiObligacionesPorVencer:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Vistazo Diario (Hoy y Mes al Día) ───────────────────────────────────

/**
 * Calcula o recupera los KPIs diarios (Hoy y Mes al Día).
 * @param {string} targetFecha Opcional. Fecha en formato YYYY-MM-DD.
 * @param {Object} metas Mapa de metas.
 */
async function kpiDiario(targetFecha = null, metas = {}) {
  try {
    const ahoraCol = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const hoyISO   = ahoraCol.toISOString().split('T')[0];
    const fechaStr = targetFecha || hoyISO;

    const [{ rows: rowsHoy }, { rows: rowsMes }] = await Promise.all([
      query(
        `SELECT ventas_dia, ingresos_dia, egresos_dia, flujo_neto_dia
         FROM analytics.v_vistazo_diario
         WHERE fecha = $1::date`,
        [fechaStr]
      ),
      query(
        `SELECT ventas_mes_acum, ingresos_mes_acum, egresos_mes_acum, flujo_mes_acum
         FROM analytics.v_vistazo_diario
         WHERE mes = TO_CHAR($1::date, 'YYYY-MM')
         ORDER BY fecha DESC
         LIMIT 1`,
        [fechaStr]
      ),
    ]);

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    const ventasHoy   = parseFloat(rowsHoy[0]?.ventas_dia    || 0);
    const ingresosHoy = parseFloat(rowsHoy[0]?.ingresos_dia  || 0);
    const egresosHoy  = parseFloat(rowsHoy[0]?.egresos_dia   || 0);
    const flujoHoy    = parseFloat(rowsHoy[0]?.flujo_neto_dia || 0);

    const ventasMes   = parseFloat(rowsMes[0]?.ventas_mes_acum   || 0);
    const ingresosMes = parseFloat(rowsMes[0]?.ingresos_mes_acum || 0);
    const egresosMes  = parseFloat(rowsMes[0]?.egresos_mes_acum  || 0);
    const flujoMes    = parseFloat(rowsMes[0]?.flujo_mes_acum    || 0);

    const metaVentas   = getMeta(metas, 'ventas_mes');
    const pctVentasMes = metaVentas > 0 ? (ventasMes / metaVentas) * 100 : 0;

    return {
      fecha: fechaStr,
      fuente: 'real',
      hoy: {
        ventas:     { valor: fmt.format(ventasHoy),   alerta: ventasHoy > 0 ? 'verde' : 'amarillo' },
        egresos:    { valor: fmt.format(egresosHoy),  alerta: 'rojo' },
        cobros:     { valor: fmt.format(ingresosHoy), alerta: 'verde' },
        saldo_neto: { valor: fmt.format(flujoHoy),    alerta: flujoHoy >= 0 ? 'verde' : 'rojo' },
        crudo: { ventasHoy, egresosHoy, cobrosHoy: ingresosHoy },
      },
      mes: {
        ventas: {
          valor: fmt.format(ventasMes),
          alerta: pctVentasMes >= getMeta(metas, 'ventas_pct_verde') ? 'verde' :
                  pctVentasMes >= getMeta(metas, 'ventas_pct_amarillo') ? 'amarillo' : 'rojo',
        },
        egresos:    { valor: fmt.format(egresosMes),  alerta: 'rojo' },
        cobros:     { valor: fmt.format(ingresosMes), alerta: 'verde' },
        flujo_neto: { valor: fmt.format(flujoMes),    alerta: flujoMes >= 0 ? 'verde' : 'rojo' },
        meta_ventas: fmt.format(metaVentas),
        pct_ventas:  `${Math.round(pctVentasMes)}%`,
        crudo: { ventasMes, egresosMes, cobrosMes: ingresosMes, metaVentas },
      },
    };
  } catch (err) {
    console.error('kpiDiario error:', err.message);
    throw err;
  }
}


// ── GET /api/kpis/diario ──────────────────────────────────────────────────────

router.get('/diario', async (req, res) => {
  try {
    const fecha = req.query.fecha || null;
    const metas = await loadParametrosFromDB();
    const data = await kpiDiario(fecha, metas);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── POST /api/kpis/snapshot ───────────────────────────────────────────────────
// n8n llama este endpoint a las 11:59 PM para guardar la foto del día en
// Vistazo_Diario_Historico. Acepta ?fecha=YYYY-MM-DD (o body.fecha) para
// poder rellenar días históricos manualmente.

const VISTAZO_HEADERS = [
  'Fecha', 'Ventas_Dia', 'Egresos_Dia', 'Cobros_Dia',
  'Ventas_Mes_Acum', 'Egresos_Mes_Acum', 'Cobros_Mes_Acum', 'Meta_Ventas_Mes',
];

/**
 * Calcula los totales del día y los guarda en Vistazo_Diario_Historico.
 * @param {string|null} fechaParam  YYYY-MM-DD. Por defecto: hoy en Colombia.
 * @returns {{ ok: boolean, fecha: string, ... }}
 */
async function ejecutarSnapshot(fechaParam = null) {
  const ahoraCol = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const hoyISO   = ahoraCol.toISOString().split('T')[0];
  const fecha    = fechaParam || hoyISO;

  // 1. Garantizar que la hoja existe con las cabeceras correctas
  await createSheetIfMissing(SP1, 'Vistazo_Diario_Historico', VISTAZO_HEADERS);

  // 2. Verificar que no exista ya un snapshot para esa fecha
  const colFecha = await readRange(SP1, 'Vistazo_Diario_Historico!A:A');
  const yaExiste = colFecha.slice(1).some(f => f[0] === fecha);
  if (yaExiste) {
    return { ok: false, motivo: `Ya existe snapshot para ${fecha}` };
  }

  // 3. Calcular totales del día en tiempo real
  const targetDate = new Date(fecha + 'T00:00:00-05:00');
  const tD = targetDate.getDate();
  const tM = targetDate.getMonth() + 1;
  const tY = targetDate.getFullYear();

  const parseFechaSnap = (val) => {
    if (!val) return null;
    const s = String(val).trim();
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return { d: parseInt(dmy[1], 10), m: parseInt(dmy[2], 10), y: parseInt(dmy[3], 10) };
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { y: parseInt(iso[1], 10), m: parseInt(iso[2], 10), d: parseInt(iso[3], 10) };
    return null;
  };
  const esDia = (f) => f && f.d === tD && f.m === tM && f.y === tY;
  const esMes = (f) => f && f.m === tM && f.y === tY && f.d <= tD;

  const usePgVentas  = process.env.DATA_SOURCE_VENTAS  !== 'sheets';
  const usePgEgresos = process.env.DATA_SOURCE_EGRESOS !== 'sheets';

  const [
    pgVHoy, pgVMes,
    filasIngr,
    pgEHoy, pgEMes,
    filasVentas, filasEgr,
    metas,
  ] = await Promise.all([
    usePgVentas
      ? query(`SELECT COALESCE(SUM(valor_neto), 0) AS total FROM crisolweb.facturas WHERE fecha_creacion::date = $1 AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA')) AND valor_neto > 0`, [fecha])
      : Promise.resolve(null),
    usePgVentas
      ? query(`SELECT COALESCE(SUM(valor_neto), 0) AS total FROM crisolweb.facturas WHERE DATE_TRUNC('month', fecha_creacion) = $1::date AND fecha_creacion::date <= $2 AND (estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA')) AND valor_neto > 0`, [`${tY}-${String(tM).padStart(2, '0')}-01`, fecha])
      : Promise.resolve(null),
    readRange(SP1, 'LISTADO_DE_INGRESOS!A:AZ'),
    usePgEgresos
      ? query(`SELECT COALESCE(SUM(valor), 0) AS total FROM crisolweb.consecutivo_egresos WHERE fecha_contable::date = $1 AND (liquidacion = 'Base Exenta' OR liquidacion IS NULL) AND (concepto IS NULL OR concepto NOT ILIKE '%CRUCE%')`, [fecha])
      : Promise.resolve(null),
    usePgEgresos
      ? query(`SELECT COALESCE(SUM(valor), 0) AS total FROM crisolweb.consecutivo_egresos WHERE EXTRACT(year FROM fecha_contable) = $1 AND EXTRACT(month FROM fecha_contable) = $2 AND fecha_contable::date <= $3 AND (liquidacion = 'Base Exenta' OR liquidacion IS NULL) AND (concepto IS NULL OR concepto NOT ILIKE '%CRUCE%')`, [tY, tM, fecha])
      : Promise.resolve(null),
    usePgVentas  ? Promise.resolve([]) : readRange(SP1, 'Facturacion_OP!A:AZ'),
    usePgEgresos ? Promise.resolve([]) : readRange(SP2, 'Consecutivo_de_egresos!A:AZ'),
    loadParametrosFromDB(),
  ]);

  // Ventas
  let ventasHoy = 0, ventasMes = 0;
  if (usePgVentas) {
    ventasHoy = parseFloat(pgVHoy.rows[0]?.total || 0);
    ventasMes = parseFloat(pgVMes.rows[0]?.total || 0);
  } else {
    const hV    = filasVentas[0] || [];
    const iValV = hV.indexOf('ValorFacturado');
    const iFecV = hV.findIndex(h => ['FechaContable', 'Fecha', 'FECHA'].includes(h));
    if (iValV !== -1 && iFecV !== -1) {
      filasVentas.slice(1).forEach(f => {
        const fObj = parseFechaSnap(f[iFecV]);
        const v    = parseCOP(f[iValV]);
        if (esDia(fObj)) ventasHoy += v;
        if (esMes(fObj)) ventasMes += v;
      });
    }
  }

  // Cobros — siempre desde Sheets
  const hI      = filasIngr[0] || [];
  const iValI   = hI.indexOf('ValorRecibido');
  const iFecI   = hI.findIndex(h => ['Fecha', 'FECHA', 'FechaContable'].includes(h));
  const iIngLiq = hI.indexOf('IngresoLiquidacion');
  let cobrosHoy = 0, cobrosMes = 0;
  if (iValI !== -1 && iFecI !== -1) {
    filasIngr.slice(1).forEach(f => {
      const liq = iIngLiq !== -1 ? (f[iIngLiq] || '').trim() : '';
      if (liq !== '') return;
      const fObj = parseFechaSnap(f[iFecI]);
      const v    = parseCOP(f[iValI]);
      if (esDia(fObj)) cobrosHoy += v;
      if (esMes(fObj)) cobrosMes += v;
    });
  }

  // Egresos
  let egresosHoy = 0, egresosMes = 0;
  if (usePgEgresos) {
    egresosHoy = parseFloat(pgEHoy.rows[0]?.total || 0);
    egresosMes = parseFloat(pgEMes.rows[0]?.total || 0);
  } else {
    const hE         = filasEgr[0] || [];
    const iValE      = hE.findIndex(h => ['NetoPagar2', 'Valor', 'Neto'].includes(h));
    const iFecE      = hE.findIndex(h => ['Fecha1', 'Fecha', 'FECHA', 'FechaContable'].includes(h));
    const iEgrLiq    = hE.indexOf('EgresoLiquidacion');
    const iMedioPago = hE.indexOf('MedioPago1');
    if (iValE !== -1 && iFecE !== -1) {
      filasEgr.slice(1).forEach(f => {
        if (iEgrLiq    !== -1 && (f[iEgrLiq]    || '').trim().toUpperCase() !== 'BASE EXENTA') return;
        if (iMedioPago !== -1 && (f[iMedioPago] || '').toUpperCase().includes('CRUCE')) return;
        const fObj = parseFechaSnap(f[iFecE]);
        const v    = parseCOP(f[iValE]);
        if (esDia(fObj)) egresosHoy += v;
        if (esMes(fObj)) egresosMes += v;
      });
    }
  }

  const metaVentas = getMeta(metas, 'ventas_mes');

  // 4. Escribir fila en Sheets
  await appendRow(SP1, 'Vistazo_Diario_Historico', [
    fecha, ventasHoy, egresosHoy, cobrosHoy,
    ventasMes, egresosMes, cobrosMes, metaVentas,
  ]);

  console.log(`[SNAPSHOT] ${fecha} guardado — ventas: ${ventasHoy} | egresos: ${egresosHoy} | cobros: ${cobrosHoy}`);
  return { ok: true, fecha, ventasHoy, egresosHoy, cobrosHoy, ventasMes, egresosMes, cobrosMes, metaVentas };
}

router.post('/snapshot', async (req, res) => {
  try {
    const metas = await loadParametrosFromDB();
    const fecha = (req.body && req.body.fecha) || req.query.fecha || null;
    const resultado = await ejecutarSnapshot(fecha);
    res.json(resultado);
  } catch (err) {
    console.error('[SNAPSHOT] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ── KPI: Rotación de personal (desde Cierre_TalentoHumano) ───────────────────

async function kpiRotacionPersonal(periodo, metas = {}) {
  try {
    const filas = await readRange(SP1, 'Cierre_TalentoHumano!A:AZ');
    if (filas.length <= 1) {
      return { fuente: 'cierre_talento_humano', nota: `Sin cierre de Talento Humano para ${periodo}` };
    }

    const h           = filas[0];
    const iPeriodo    = h.indexOf('Período');
    const iTotal      = h.indexOf('Total_Empleados');
    const iRetiros    = h.indexOf('Retiros_Mes');
    const iAusentismo = h.indexOf('Dias_Ausentismo');
    const iIncidentes = h.indexOf('Incidentes_Seguridad');

    const filasPeriodo = filas.slice(1).filter(f => (f[iPeriodo] || '') === periodo);
    if (filasPeriodo.length === 0) {
      return { fuente: 'cierre_talento_humano', nota: `Sin cierre de Talento Humano para ${periodo}` };
    }

    const fila           = filasPeriodo[filasPeriodo.length - 1]; // más reciente
    const totalEmpleados = parseInt(fila[iTotal]      || '0', 10);
    const retiros        = parseInt(fila[iRetiros]    || '0', 10);
    const ausentismo     = fila[iAusentismo]  || '0';
    const incidentes     = fila[iIncidentes]  || '0';

    const rotacion = totalEmpleados > 0 ? Math.round(retiros / totalEmpleados * 1000) / 10 : 0;

    return {
      fuente: 'real',
      valor: rotacion,
      valorFormateado: `${rotacion}%`,
      meta: `Alerta si > ${getMeta(metas, 'rotacion_personal_max')}%`,
      totalEmpleados,
      retiros,
      diasAusentismo: ausentismo,
      incidentesSeguridad: incidentes,
      detalle: `Empleados: ${totalEmpleados} | Retiros: ${retiros} | Ausentismo: ${ausentismo} días | Incidentes: ${incidentes}`,
      alerta: alertaColor(rotacion, {
        verde:    v => v <= getMeta(metas, 'rotacion_personal_max') * 0.6,  // 60% del máximo = verde
        amarillo: v => v <= getMeta(metas, 'rotacion_personal_max'),
      }),
    };
  } catch (err) {
    console.error('kpiRotacionPersonal:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── GET /api/kpis ─────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const periodo = req.query.periodo || mesActual();
    const { mesLabel, mesNum, anio } = parsePeriodo(periodo);

    // Cargar metas desde Sheets (con fallback a .env si falla o no existe la clave)
    const metas = await loadParametrosFromDB();

    const [ventas, margen, cartera, flujo, cierre, produccion, costo, rotacion, obligaciones, diario, calidad] = await Promise.all([
      kpiVentasMeta({ mesNum, anio }, metas),
      kpiMargenCaja({ mesNum, anio }, metas),
      kpiCarteraPorAsesor(metas),
      kpiFlujoCaja({ mesNum, anio }, metas),
      kpiCierreMensual(periodo, metas),
      kpiOrdenesCumplidas({ mesNum, anio }, metas),
      kpiCostoProduccion({ mesNum, anio }, metas),
      kpiRotacionPersonal(periodo, metas),
      kpiObligacionesPorVencer(),
      kpiDiario(req.query.fecha, metas).catch(() => null),
      kpiCalidadRegistro({ mesNum, anio }, metas),
    ]);

    res.json({
      periodo,
      kpis: {
        ventas_meta:             { id: 'ventas-meta',             nombre: 'Ventas Reales (Facturado)',    area: 'Ventas',          ...ventas        },
        margen_caja:             { id: 'margen-caja',             nombre: 'Margen de caja',             area: 'Finanzas',        ...margen        },
        cartera_asesores:        { id: 'cartera-asesores',        nombre: 'CxC por Asesor',               area: 'Cartera',      ...cartera       },
        flujo_caja:              { id: 'flujo-caja',              nombre: 'Flujo de caja disponible',      area: 'Finanzas',     ...flujo         },
        obligaciones_por_vencer: { id: 'obligaciones-por-vencer', nombre: 'Obligaciones por vencer',      area: 'Proveedores',  ...obligaciones  },
        cierre_mensual:          { id: 'cierre-mensual',          nombre: '% Cierre mensual',           area: 'Todas las áreas', ...cierre        },
        ordenes_cumplidas:       { id: 'ordenes-cumplidas',       nombre: 'Órdenes Cumplidas',          area: 'Producción',      ...produccion    },
        costo_produccion:        { id: 'costo-produccion',        nombre: 'Producción Cumplida (Valorizada)',        area: 'Producción',      ...costo         },
        calidad_registro:        { id: 'calidad-registro',        nombre: 'Calidad de Registro',        area: 'Producción',      ...calidad       },
        rotacion_personal:       { id: 'rotacion-personal',       nombre: 'Rotación de personal',       area: 'Talento Humano',  ...rotacion      },
      },
      diario,
    });
  } catch (err) {
    console.error('GET /api/kpis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kpis/ventas-debug?periodo=2026-04
 * Compara suma de ventas entre crisolweb.facturas, crisolweb.facturacion_op y Sheets.
 */
router.get('/ventas-debug', async (req, res) => {
  try {
    const periodo = req.query.periodo || mesActual();
    const { mesNum, anio } = parsePeriodo(periodo);
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    // 1. crisolweb.facturas (fuente actual)
    let facturas = null;
    try {
      const [{ rows }, { rows: estadoRows }] = await Promise.all([
        query(
          `SELECT COALESCE(SUM(valor_neto), 0) AS total, COUNT(*) AS registros,
                  MIN(fecha_creacion) AS fecha_min, MAX(fecha_creacion) AS fecha_max
           FROM crisolweb.facturas
           WHERE EXTRACT(month FROM fecha_creacion) = $1 AND EXTRACT(year FROM fecha_creacion) = $2`,
          [mesNum, anio]
        ),
        query(
          `SELECT estado, COUNT(*) AS registros, SUM(valor_neto) AS total
           FROM crisolweb.facturas
           WHERE EXTRACT(month FROM fecha_creacion) = $1 AND EXTRACT(year FROM fecha_creacion) = $2
           GROUP BY estado ORDER BY SUM(valor_neto) DESC`,
          [mesNum, anio]
        ),
      ]);
      facturas = {
        total: fmt.format(rows[0].total),
        registros: rows[0].registros,
        fecha_min: rows[0].fecha_min,
        fecha_max: rows[0].fecha_max,
        por_estado: estadoRows.map(r => ({ estado: r.estado, registros: r.registros, total: fmt.format(r.total) })),
      };
    } catch (e) { facturas = { error: e.message }; }

    // 2. crisolweb.facturacion_op (tabla alternativa)
    let facturacion_op = null;
    try {
      const { rows: cols } = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'crisolweb' AND table_name = 'facturacion_op'
         ORDER BY ordinal_position LIMIT 20`
      );
      if (cols.length === 0) {
        facturacion_op = { error: 'Tabla no existe' };
      } else {
        facturacion_op = { columnas: cols.map(c => c.column_name) };
        // Intentar suma con columnas comunes
        for (const col of ['valor_facturado', 'valor_neto', 'total', 'valor']) {
          if (cols.find(c => c.column_name === col)) {
            const fechaCols = cols.map(c => c.column_name).filter(n => n.includes('fecha'));
            const fechaCol  = fechaCols[0] || 'fecha';
            try {
              const { rows } = await query(
                `SELECT COALESCE(SUM(${col}), 0) AS total, COUNT(*) AS registros
                 FROM crisolweb.facturacion_op
                 WHERE EXTRACT(month FROM ${fechaCol}) = $1 AND EXTRACT(year FROM ${fechaCol}) = $2`,
                [mesNum, anio]
              );
              facturacion_op[`suma_${col}`] = fmt.format(rows[0].total);
              facturacion_op[`registros_${col}`] = rows[0].registros;
            } catch (e) { facturacion_op[`error_${col}`] = e.message; }
            break;
          }
        }
      }
    } catch (e) { facturacion_op = { error: e.message }; }

    // 3. Sheets Facturacion_OP
    let sheets = null;
    try {
      const filas = await readRange(SP1, 'Facturacion_OP!A:AZ');
      const h = filas[0] || [];
      const iVal = h.indexOf('ValorFacturado');
      const iFec = h.findIndex(c => ['FechaContable', 'Fecha', 'FECHA'].includes(c));
      let total = 0, registros = 0;
      filas.slice(1).forEach(f => {
        const s = String(f[iFec] || '').trim();
        const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const m = dmy ? parseInt(dmy[2]) : iso ? parseInt(iso[2]) : null;
        const y = dmy ? parseInt(dmy[3]) : iso ? parseInt(iso[1]) : null;
        if (m === mesNum && y === anio) { total += parseCOP(f[iVal]); registros++; }
      });
      sheets = { total: fmt.format(total), registros, columnas: h.slice(0, 15) };
    } catch (e) { sheets = { error: e.message }; }

    res.json({ periodo, fuentes: { facturas, facturacion_op, sheets } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kpis/metas-debug
 * Muestra el contenido crudo de Metas_Gerencia y el mapa resultante.
 * Útil para diagnosticar por qué una meta no se lee correctamente.
 */
router.get('/metas', async (req, res) => {
  try {
    const filas = await readRange(SP1, 'Metas_Gerencia!A:G');
    const mapa  = await loadParametrosFromDB();
    res.json({
      headers:        filas[0]  || [],
      filas_raw:      filas.slice(1),
      mapa_resultante: mapa,
      claves_internas_esperadas: Object.keys(ENV_METAS),
      claves_cargadas_desde_sheet: Object.keys(mapa),
      claves_sin_match: Object.keys(ENV_METAS).filter(k => mapa[k] === undefined),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kpis/headers/:spreadsheet/:sheet
 */
router.get('/headers/:spreadsheet/:sheet', async (req, res) => {
  const spreadsheetId = req.params.spreadsheet === '1' ? SP1 : SP2;
  const sheetName = req.params.sheet;
  try {
    const filas = await readRange(spreadsheetId, `${sheetName}!A1:AZ2`);
    res.json({
      sheetName,
      headers: filas[0] || [],
      primera_fila_datos: filas[1] || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kpis/sheets/:spreadsheet
 */
router.get('/sheets/:spreadsheet', async (req, res) => {
  const spreadsheetId = req.params.spreadsheet === '1' ? SP1 : SP2;
  try {
    const { getSheetsAPI } = require('../sheetsClient');
    const sheets = getSheetsAPI();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const nombres = meta.data.sheets.map(s => s.properties.title);
    res.json({ spreadsheet: req.params.spreadsheet, pestañas: nombres });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.ejecutarSnapshot = ejecutarSnapshot;
