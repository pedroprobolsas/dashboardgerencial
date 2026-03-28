'use strict';
const express = require('express');
const router = express.Router();
const { readRange } = require('../sheetsClient');

const SP1 = process.env.SPREADSHEET_ID_1;
const SP2 = process.env.SPREADSHEET_ID_2;

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Metas desde Google Sheets con fallback a .env ─────────────────────────────

const ENV_METAS = {
  ventas_mes:             parseFloat(process.env.META_VENTAS                  || '200000000'),
  ventas_pct_verde:       parseFloat(process.env.META_VENTAS_PCT_VERDE        || '90'),
  ventas_pct_amarillo:    parseFloat(process.env.META_VENTAS_PCT_AMARILLO     || '80'),
  // Margen: meta objetivo (mínimo aceptable) + umbrales de semáforo
  margen_bruto:           parseFloat(process.env.META_MARGEN_BRUTO            || '28'),
  margen_verde:           parseFloat(process.env.META_MARGEN_VERDE            || '35'),
  margen_amarillo:        parseFloat(process.env.META_MARGEN_AMARILLO         || '25'),
  // Cartera / proveedores
  cartera_verde:          parseFloat(process.env.META_CARTERA_VERDE           || '30000000'),
  cartera_amarillo:       parseFloat(process.env.META_CARTERA_AMARILLO        || '50000000'),
  cartera_vencida_max:    parseFloat(process.env.META_CARTERA_MAX             || '30000000'),
  // Flujo de caja
  flujo_verde:            parseFloat(process.env.META_FLUJO_VERDE             || '50000000'),
  // Eficiencia producción
  eficiencia_produccion:  parseFloat(process.env.META_EFICIENCIA              || '85'),
  // Rotación personal
  rotacion_personal_max:  parseFloat(process.env.META_ROTACION               || '5'),
  // Cierres
  cierre_mensual:         parseFloat(process.env.META_CIERRE                  || '100'),
  cierre_verde:           parseFloat(process.env.META_CIERRE_VERDE            || '100'),
  cierre_amarillo:        parseFloat(process.env.META_CIERRE_AMARILLO         || '60'),
};

/**
 * Lee la hoja Metas_Gerencia desde SP1, filtra Activo="SI",
 * y devuelve un mapa { [KPI]: valor_numerico }.
 */
async function loadMetasFromSheets() {
  try {
    const filas = await readRange(SP1, 'Metas_Gerencia!A:G');
    if (filas.length <= 1) return {};

    const headers = filas[0];
    const iKPI    = headers.indexOf('KPI');
    const iMeta   = headers.indexOf('Meta');
    const iActivo = headers.indexOf('Activo');

    if (iKPI === -1 || iMeta === -1 || iActivo === -1) {
      console.warn('loadMetasFromSheets: columnas KPI/Meta/Activo no encontradas en Metas_Gerencia');
      return {};
    }

    const mapa = {};
    filas.slice(1).forEach(fila => {
      if ((fila[iActivo] || '').toString().trim().toUpperCase() !== 'SI') return;
      const kpi  = (fila[iKPI] || '').toString().trim();
      const raw  = fila[iMeta];
      if (!kpi || raw === undefined || raw === '') return;
      // Soporta formato colombiano: "1.234.567,89" o formato simple "200000000"
      const valor = parseFloat(
        String(raw).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
      );
      if (!isNaN(valor)) mapa[kpi] = valor;
    });

    console.log('Metas cargadas desde Sheets:', mapa);
    return mapa;
  } catch (err) {
    console.error('loadMetasFromSheets error (usando .env como respaldo):', err.message);
    return {};
  }
}

/** Devuelve el valor de la meta: primero busca en Sheets, luego usa .env/default. */
function getMeta(metasSheets, key) {
  return metasSheets[key] !== undefined ? metasSheets[key] : ENV_METAS[key];
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
    const total = 5;
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

// ── KPI: Ventas del mes vs meta ───────────────────────────────────────────────
// Columnas relevantes en Facturacion_OP: ValorFacturado, MES, FechaContable (para año)

async function kpiVentasMeta({ mesLabel, anio }, metas = {}) {
  try {
    const filas = await readRange(SP1, 'Facturacion_OP!A:AZ');
    if (filas.length <= 1) return { fuente: 'real', valor: 0, valorFormateado: '0%' };

    const h = filas[0];
    const iValor = h.indexOf('ValorFacturado');
    const iMes   = h.indexOf('MES');

    if (iValor === -1 || iMes === -1) return { fuente: 'error', detalle: 'Columnas ValorFacturado/MES no encontradas' };

    // Filtro: solo por MES (minúsculas sin tilde). La hoja ya está segmentada por periodo.
    const filasPeriodo = filas.slice(1)
      .filter(f => (f[iMes] || '').toString().toLowerCase().trim() === mesLabel);

    if (filasPeriodo.length === 0) {
      return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', meta: 'Sin facturas este período', alerta: 'amarillo' };
    }

    const total      = filasPeriodo.reduce((sum, f) => sum + parseCOP(f[iValor]), 0);
    const metaVentas = getMeta(metas, 'ventas_mes');
    const pct        = Math.round((total / metaVentas) * 100);
    const fmt        = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    return {
      fuente: 'real',
      valor: pct,
      valorFormateado: `${pct}%`,
      valorAbsoluto: fmt.format(total),
      meta: `Meta: ${fmt.format(metaVentas)}`,
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

// ── KPI: Margen bruto % ───────────────────────────────────────────────────────

async function kpiMargenBruto({ mesLabel }, metas = {}) {
  try {
    const filas = await readRange(SP1, 'Facturacion_OP!A:AZ');
    if (filas.length <= 1) return { fuente: 'real', valor: 0, valorFormateado: '0%' };

    const h = filas[0];
    const iMargen = h.indexOf('MARGEN');
    const iMes    = h.indexOf('MES');

    if (iMargen === -1 || iMes === -1) return { fuente: 'error', detalle: 'Columnas MARGEN/MES no encontradas' };

    // Filtro solo por MES. Promedio simple: quitar "%" y promediar.
    const margenes = filas.slice(1)
      .filter(f => (f[iMes] || '').toString().toLowerCase().trim() === mesLabel)
      .map(f => parsePct(f[iMargen]))
      .filter(v => v !== null && !isNaN(v));

    if (margenes.length === 0) return { fuente: 'real', sinDatos: true, valor: 0, valorFormateado: '—', meta: 'Sin facturas este período', alerta: 'amarillo' };

    const margenPct = Math.round(margenes.reduce((s, v) => s + v, 0) / margenes.length * 10) / 10;

    const metaObjetivo = getMeta(metas, 'margen_bruto');
    const umbralVerde  = getMeta(metas, 'margen_verde');
    const umbralAmari  = getMeta(metas, 'margen_amarillo');

    return {
      fuente: 'real',
      valor: margenPct,
      valorFormateado: `${margenPct}%`,
      meta: `Meta: ≥ ${metaObjetivo}% | Verde: ≥ ${umbralVerde}%`,
      alerta: alertaColor(margenPct, {
        verde:    v => v >= umbralVerde,
        amarillo: v => v >= umbralAmari,
      }),
    };
  } catch (err) {
    console.error('kpiMargenBruto:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Cartera vencida ──────────────────────────────────────────────────────
// Dato puntual (saldo actual), no se filtra por período

async function kpiCarteraVencida(metas = {}) {
  try {
    const filas = await readRange(SP2, 'CarteraPorPagarDetalladaPorTercero!A:AZ');
    if (filas.length <= 1) return { fuente: 'real', valor: 0, valorFormateado: '$0' };

    const h = filas[0];
    const iSaldo = h.indexOf('Saldo');
    const iDias  = h.indexOf('DiasVencidos');
    if (iSaldo === -1 || iDias === -1) return { fuente: 'error', detalle: 'Columnas Saldo/DiasVencidos no encontradas' };

    const filasFiltradas = filas.slice(1).filter(f => {
      const dias = parseInt(f[iDias] || '0', 10);
      return !isNaN(dias) && dias < 0;
    });

    const totalVencido = filasFiltradas.reduce((sum, f) => sum + parseCOP(f[iSaldo]), 0);

    // Desglose por rango de días vencidos (DiasVencidos negativo: -1 = 1 día vencido)
    // Rango inclusivo en ambos extremos: sumaRango(-1, -31) = días -1 a -30 inclusive
    const sumaRango = (desde, hasta) => filasFiltradas
      .filter(f => { const d = parseInt(f[iDias] || '0', 10); return d <= desde && d > hasta; })
      .reduce((s, f) => s + parseCOP(f[iSaldo]), 0);

    const raw30      = sumaRango(-1,   -31);
    const raw60      = sumaRango(-31,  -61);
    const raw90      = sumaRango(-61,  -91);
    const raw100plus = sumaRango(-91, -Infinity);

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    return {
      fuente: 'real',
      valor: totalVencido,
      valorFormateado: fmt.format(totalVencido),
      meta: `Umbral: < $${(getMeta(metas, 'cartera_verde') / 1_000_000).toFixed(0)}M`,
      desglose: {
        d30:      fmt.format(raw30),
        d60:      fmt.format(raw60),
        d90:      fmt.format(raw90),
        d100plus: fmt.format(raw100plus),
      },
      d30Raw:      raw30,      // cartera 1-30 días (para cálculo brecha)
      d100plusRaw: raw100plus, // cartera +90 días (para alerta incobrabilidad)
      alerta: alertaColor(totalVencido, {
        verde:    v => v < getMeta(metas, 'cartera_verde'),
        amarillo: v => v <= getMeta(metas, 'cartera_amarillo'),
      }),
    };
  } catch (err) {
    console.error('kpiCarteraVencida:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Flujo de caja disponible ─────────────────────────────────────────────
// LISTADO_DE_INGRESOS → ValorNeto, Mes, Año
// Consecutivo_de_egresos → NetoPagar2, Mes, Año

async function kpiFlujoCaja({ mesLabel, anio }, metas = {}) {
  try {
    const anioStr = String(anio);

    const [filasIngr, filasEgr] = await Promise.all([
      readRange(SP1, 'LISTADO_DE_INGRESOS!A:AZ'),
      readRange(SP2, 'Consecutivo_de_egresos!A:AZ'),
    ]);

    // ── Ingresos: solo filas base (IngresoLiquidacion vacía), filtro por Mes y Año ──
    const hI          = filasIngr[0] || [];
    const iVal        = hI.indexOf('ValorRecibido');
    const iMesI       = hI.indexOf('Mes');
    const iAnioI      = hI.indexOf('Año');
    const iIngLiq     = hI.indexOf('IngresoLiquidacion');

    const ingresos = iVal !== -1 && iMesI !== -1
      ? filasIngr.slice(1)
          .filter(f => {
            if ((f[iMesI] || '').toString().toLowerCase().trim() !== mesLabel) return false;
            if (iAnioI !== -1 && (f[iAnioI] || '').toString().trim() !== anioStr) return false;
            // Solo fila base: IngresoLiquidacion vacía
            const liq = iIngLiq !== -1 ? (f[iIngLiq] || '').toString().trim() : '';
            return liq === '';
          })
          .reduce((s, f) => s + parseCOP(f[iVal]), 0)
      : 0;

    // ── Egresos: solo "Base Exenta", excluir CRUCE, filtro por Mes y Año ──
    const hE          = filasEgr[0] || [];
    const iNeto       = hE.indexOf('NetoPagar2');
    const iMesE       = hE.indexOf('Mes');
    const iAnioE      = hE.indexOf('Año');
    const iEgrLiq     = hE.indexOf('EgresoLiquidacion');
    const iMedioPago  = hE.indexOf('MedioPago1');

    const egresos = iNeto !== -1 && iMesE !== -1
      ? filasEgr.slice(1)
          .filter(f => {
            if ((f[iMesE] || '').toString().toLowerCase().trim() !== mesLabel) return false;
            // Filtro año exacto
            if (iAnioE !== -1 && (f[iAnioE] || '').toString().trim() !== anioStr) return false;
            // Solo fila base sin duplicados: EgresoLiquidacion == "Base Exenta"
            if (iEgrLiq !== -1 && (f[iEgrLiq] || '').toString().trim() !== 'Base Exenta') return false;
            // Excluir cruces contables (cualquier variante que contenga "CRUCE")
            if (iMedioPago !== -1 && (f[iMedioPago] || '').toString().toUpperCase().includes('CRUCE')) return false;
            return true;
          })
          .reduce((s, f) => s + parseCOP(f[iNeto]), 0)
      : 0;

    const flujo = ingresos - egresos;
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    // Días de caja: cuántos días de egresos cubre el flujo actual (22 días hábiles/mes)
    const diasCajaDisponibles = egresos > 0
      ? parseFloat((flujo / (egresos / 22)).toFixed(1))
      : null;

    return {
      fuente: 'real',
      valor: flujo,
      valorFormateado: fmt.format(flujo),
      meta: 'Alerta si negativo',
      detalle: `Ingresos: ${fmt.format(ingresos)} | Egresos: ${fmt.format(egresos)}`,
      egresosRaw: egresos,
      flujoRaw:   flujo,
      diasCajaDisponibles,
      alerta: alertaColor(flujo, {
        verde:    v => v > getMeta(metas, 'flujo_verde'),
        amarillo: v => v >= 0,
      }),
    };
  } catch (err) {
    console.error('kpiFlujoCaja:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Producción desde Costo_por Orden ─────────────────────────────────────

async function kpiProduccion({ mesNum, anio }, metas = {}) {
  try {
    const filas = await readRange(SP1, 'Costo_por Orden!A:AZ');
    if (filas.length <= 1) return { fuente: 'real', valor: 0, valorFormateado: '—' };

    const h = filas[0];
    const iFechaFin = h.indexOf('FechaFinOP');
    const iEstim    = h.indexOf('CostoTotalEstimado');
    const iEjec     = h.indexOf('CostoTotalEjecutado1');
    const iValor    = h.indexOf('ValorCumplido');

    if (iFechaFin === -1 || iEstim === -1 || iEjec === -1 || iValor === -1) {
      return { fuente: 'error', detalle: 'Columnas no encontradas en Costo_por Orden' };
    }

    // Filtro: FechaFinOP en formato DD/MM/YYYY — extraer mes y año
    const datos = filas.slice(1).filter(f => {
      const m = String(f[iFechaFin] || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      return m && parseInt(m[2], 10) === mesNum && parseInt(m[3], 10) === anio;
    });

    const ordenes = datos.length;
    if (ordenes === 0) {
      return { fuente: 'real', valor: 0, valorFormateado: '0%', ordenes: 0, detalle: 'Sin órdenes en este período' };
    }

    const sumEstim = datos.reduce((s, f) => s + parseCOP(f[iEstim]), 0);
    const sumEjec  = datos.reduce((s, f) => s + parseCOP(f[iEjec]),  0);
    const sumValor = datos.reduce((s, f) => s + parseCOP(f[iValor]), 0);

    // Eficiencia = CostoEstimado / CostoEjecutado × 100 (> 100% = mejor de lo esperado)
    const eficiencia = sumEjec  > 0 ? Math.round(sumEstim / sumEjec  * 1000) / 10 : 0;
    // Margen producción = (ValorCumplido - CostoEjecutado) / ValorCumplido × 100
    const margenProd = sumValor > 0 ? Math.round((sumValor - sumEjec) / sumValor * 1000) / 10 : 0;

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    const ahorro          = Math.round(sumEstim - sumEjec);
    const utilidad        = Math.round(sumValor  - sumEjec);

    return {
      fuente: 'real',
      valor: eficiencia,
      valorFormateado: `${eficiencia}%`,
      meta: `Meta: eficiencia > 100%`,
      ordenes,
      margenProduccion:   margenProd,
      valorProducido:     fmt.format(sumValor),                          // ValorCumplido
      costoEjecutado:     fmt.format(sumEjec),                           // CostoTotalEjecutado1
      utilidadProduccion: fmt.format(utilidad),                          // ValorCumplido - CostoEjecutado
      ahorroPresupuesto:  ahorro >= 0 ? `+${fmt.format(ahorro)}` : fmt.format(ahorro),
      ahorroNumerico:     ahorro,                                        // raw number para formatear en frontend
      meta: `Meta: > 100% | Mín. aceptable: ${getMeta(metas, 'eficiencia_produccion')}%`,
      detalle: `${ordenes} OPs | Efic.: ${eficiencia}% | Margen: ${margenProd.toFixed(1)}% | Producido: ${fmt.format(sumValor)}`,
      alerta: alertaColor(eficiencia, {
        verde:    v => v > 100,
        amarillo: v => v >= getMeta(metas, 'eficiencia_produccion'),
      }),
    };
  } catch (err) {
    console.error('kpiProduccion:', err.message);
    return { fuente: 'error', detalle: err.message };
  }
}

// ── KPI: Obligaciones por vencer (desde CarteraPorPagarDetalladaPorTercero) ──
// Fuente correcta: deuda ACTUAL de la empresa (solo obligaciones pendientes).
// DiasVencidos negativo = vencida (ej: -30 = 30 días de mora).
// DiasVencidos positivo = por vencer (ej: 15 = vence en 15 días).
// No filtra por período: liquidez en tiempo real.

async function kpiObligacionesPorVencer() {
  try {
    const filas = await readRange(SP2, 'CarteraPorPagarDetalladaPorTercero!A:AZ');
    if (filas.length <= 1) return { fuente: 'real', valor: 0, valorFormateado: '$0' };

    const h        = filas[0];
    const iSaldo   = h.indexOf('Saldo');
    const iDias    = h.indexOf('DiasVencidos');
    // Buscar columna de nombre del proveedor (puede llamarse Tercero o NombreTercero)
    const iTercero = h.indexOf('Tercero') !== -1 ? h.indexOf('Tercero') : h.indexOf('NombreTercero');

    if (iSaldo === -1 || iDias === -1) {
      return { fuente: 'error', detalle: 'Columnas Saldo/DiasVencidos no encontradas en CarteraPorPagarDetalladaPorTercero' };
    }

    let totalVencido = 0;
    let d15 = 0, d30 = 0, d60 = 0, d60plus = 0;
    const porProveedor = {};

    filas.slice(1).forEach(f => {
      const monto   = parseCOP(f[iSaldo]);
      const dias    = parseInt((f[iDias] || '0').toString(), 10);
      const tercero = iTercero !== -1 ? (f[iTercero] || '').toString().trim() : '';

      if (!monto || isNaN(dias)) return;

      // DiasVencidos negativo = vencida, positivo = por vencer
      if (dias < 0) {
        totalVencido += monto;
      } else if (dias <= 15) {
        d15 += monto;
      } else if (dias <= 30) {
        d30 += monto;
      } else if (dias <= 60) {
        d60 += monto;
      } else {
        d60plus += monto;
      }

      if (tercero) {
        porProveedor[tercero] = (porProveedor[tercero] || 0) + monto;
      }
    });

    const totalPorVencer = d15 + d30 + d60 + d60plus;
    const total          = totalVencido + totalPorVencer;
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    const topProveedores = Object.entries(porProveedor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre, monto]) => ({ nombre, monto: fmt.format(monto) }));

    return {
      fuente:             'real',
      valor:              total,
      valorFormateado:    fmt.format(total),
      meta:               'Total obligaciones activas',
      totalPorVencer:     fmt.format(totalPorVencer),
      totalVencidoPorPagar: fmt.format(totalVencido),
      desgloseVencimientos: {
        vencido: fmt.format(totalVencido),
        d15:     fmt.format(d15),
        d30:     fmt.format(d30),
        d60:     fmt.format(d60),
        d60plus: fmt.format(d60plus),
      },
      topProveedores,
      totalVencidoRaw: totalVencido,  // para cálculo brecha en frontend
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

async function kpiDiario(metas = {}) {
  try {
    // ── Tiempo en Colombia (UTC-5) ──
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const hoyD   = ahora.getDate();
    const hoyM   = ahora.getMonth() + 1;
    const hoyY   = ahora.getFullYear();

    const [filasVentas, filasIngr, filasEgr] = await Promise.all([
      readRange(SP1, 'Facturacion_OP!A:AZ'),
      readRange(SP1, 'LISTADO_DE_INGRESOS!A:AZ'),
      readRange(SP2, 'Consecutivo_de_egresos!A:AZ'),
    ]);

    const parseFecha = (val) => {
      if (!val) return null;
      const s = String(val).trim();
      // Formato DD/MM/YYYY
      const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) return { d: parseInt(dmy[1], 10), m: parseInt(dmy[2], 10), y: parseInt(dmy[3], 10) };
      // Formato YYYY-MM-DD
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return { y: parseInt(iso[1], 10), m: parseInt(iso[2], 10), d: parseInt(iso[3], 10) };
      return null;
    };

    const esHoy = (fObj) => fObj && fObj.d === hoyD && fObj.m === hoyM && fObj.y === hoyY;
    const esMesActual = (fObj) => fObj && fObj.m === hoyM && fObj.y === hoyY;

    // 1. VENTAS
    const hV = filasVentas[0] || [];
    const iValV = hV.indexOf('ValorFacturado');
    const iFecV = hV.findIndex(h => ['FechaContable', 'Fecha', 'FECHA'].includes(h));
    let ventasHoy = 0, ventasMes = 0;
    if (iValV !== -1 && iFecV !== -1) {
      filasVentas.slice(1).forEach(f => {
        const fecha = parseFecha(f[iFecV]);
        const monto = parseCOP(f[iValV]);
        if (esHoy(fecha)) ventasHoy += monto;
        if (esMesActual(fecha)) ventasMes += monto;
      });
    }

    // 2. INGRESOS (COBROS)
    const hI = filasIngr[0] || [];
    const iValI = hI.indexOf('ValorRecibido');
    const iFecI = hI.findIndex(h => ['Fecha', 'FECHA', 'FechaContable'].includes(h));
    const iIngLiq = hI.indexOf('IngresoLiquidacion');
    let cobrosHoy = 0, cobrosMes = 0;
    if (iValI !== -1 && iFecI !== -1) {
      filasIngr.slice(1).forEach(f => {
        const liq = iIngLiq !== -1 ? (f[iIngLiq] || '').toString().trim() : '';
        if (liq !== '') return;
        const fecha = parseFecha(f[iFecI]);
        const monto = parseCOP(f[iValI]);
        if (esHoy(fecha)) cobrosHoy += monto;
        if (esMesActual(fecha)) cobrosMes += monto;
      });
    }

    // 3. EGRESOS
    const hE = filasEgr[0] || [];
    const iValE = hE.findIndex(h => ['NetoPagar2', 'Valor', 'Neto'].includes(h));
    const iFecE = hE.findIndex(h => ['Fecha1', 'Fecha', 'FECHA', 'FechaContable'].includes(h));
    const iEgrLiq = hE.indexOf('EgresoLiquidacion');
    const iMedioPago = hE.indexOf('MedioPago1');
    let egresosHoy = 0, egresosMes = 0;

    // [DEBUG] — eliminar después de validar
    const rowsE = filasEgr.slice(1);
    console.log('[DEBUG egresos]', { iFecE, nombreColumnaFecha: hE[iFecE], iValE, nombreColumnaValor: hE[iValE], iEgrLiq, totalFilas: rowsE.length, primeraFila: rowsE[0], ultimaFila: rowsE[rowsE.length - 1] });
    // [/DEBUG]

    if (iValE !== -1 && iFecE !== -1) {
      filasEgr.slice(1).forEach(f => {
        if (iEgrLiq !== -1 && (f[iEgrLiq] || '').toString().trim() !== 'Base Exenta') return;
        if (iMedioPago !== -1 && (f[iMedioPago] || '').toString().toUpperCase().includes('CRUCE')) return;
        const fecha = parseFecha(f[iFecE]);
        const monto = parseCOP(f[iValE]);
        if (esHoy(fecha)) egresosHoy += monto;
        if (esMesActual(fecha)) egresosMes += monto;
      });
    }

    const metaVentas = getMeta(metas, 'ventas_mes');
    const pctVentasMes = metaVentas > 0 ? (ventasMes / metaVentas) * 100 : 0;
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    const saldoHoy = cobrosHoy - egresosHoy;
    const flujoMes = cobrosMes - egresosMes;

    return {
      hoy: {
        ventas:     { valor: fmt.format(ventasHoy),  alerta: ventasHoy > 0 ? 'verde' : 'amarillo' },
        egresos:    { valor: fmt.format(egresosHoy), alerta: 'rojo' }, // Egresos se ven en rojo
        cobros:     { valor: fmt.format(cobrosHoy),  alerta: 'verde' },
        saldo_neto: { valor: fmt.format(saldoHoy),   alerta: saldoHoy >= 0 ? 'verde' : 'rojo' },
        crudo: { ventasHoy, egresosHoy, cobrosHoy }
      },
      mes: {
        ventas:     { 
          valor: fmt.format(ventasMes), 
          alerta: pctVentasMes >= getMeta(metas, 'ventas_pct_verde') ? 'verde' : 
                  pctVentasMes >= getMeta(metas, 'ventas_pct_amarillo') ? 'amarillo' : 'rojo' 
        },
        egresos:    { valor: fmt.format(egresosMes), alerta: 'rojo' },
        cobros:     { valor: fmt.format(cobrosMes),  alerta: 'verde' },
        flujo_neto: { valor: fmt.format(flujoMes),   alerta: flujoMes >= 0 ? 'verde' : 'rojo' },
        meta_ventas:    fmt.format(metaVentas),
        pct_ventas:     `${Math.round(pctVentasMes)}%`,
        crudo: { ventasMes, egresosMes, cobrosMes, metaVentas }
      }
    };
  } catch (err) {
    console.error('kpiDiario error:', err.message);
    throw err;
  }
}

// ── GET /api/kpis/diario ──────────────────────────────────────────────────────

router.get('/diario', async (req, res) => {
  try {
    const metas = await loadMetasFromSheets();
    const data = await kpiDiario(metas);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const metas = await loadMetasFromSheets();

    const [ventas, margen, cartera, flujo, cierre, produccion, rotacion, obligaciones, diario] = await Promise.all([
      kpiVentasMeta({ mesLabel, anio }, metas),
      kpiMargenBruto({ mesLabel, anio }, metas),
      kpiCarteraVencida(metas),
      kpiFlujoCaja({ mesLabel, anio }, metas),
      kpiCierreMensual(periodo, metas),
      kpiProduccion({ mesNum, anio }, metas),
      kpiRotacionPersonal(periodo, metas),
      kpiObligacionesPorVencer(),
      kpiDiario(metas).catch(() => null),
    ]);

    res.json({
      periodo,
      kpis: {
        ventas_meta:             { id: 'ventas-meta',             nombre: 'Ventas del mes vs meta',    area: 'Ventas',          ...ventas        },
        margen_bruto:            { id: 'margen-bruto',            nombre: 'Margen bruto',               area: 'Finanzas',        ...margen        },
        cartera_vencida:         { id: 'cartera-vencida',         nombre: 'Deuda vencida con proveedores', area: 'Proveedores',  ...cartera       },
        flujo_caja:              { id: 'flujo-caja',              nombre: 'Flujo de caja disponible',      area: 'Finanzas',     ...flujo         },
        obligaciones_por_vencer: { id: 'obligaciones-por-vencer', nombre: 'Obligaciones por vencer',      area: 'Proveedores',  ...obligaciones  },
        cierre_mensual:          { id: 'cierre-mensual',          nombre: '% Cierre mensual',           area: 'Todas las áreas', ...cierre        },
        eficiencia_produccion:   { id: 'eficiencia-produccion',   nombre: 'Producción',                 area: 'Producción',      ...produccion    },
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
 * GET /api/kpis/metas-debug
 * Muestra el contenido crudo de Metas_Gerencia y el mapa resultante.
 * Útil para diagnosticar por qué una meta no se lee correctamente.
 */
router.get('/metas-debug', async (req, res) => {
  try {
    const filas = await readRange(SP1, 'Metas_Gerencia!A:G');
    const mapa  = await loadMetasFromSheets();
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
