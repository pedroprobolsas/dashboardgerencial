'use strict';
/**
 * validate-migration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Compara los resultados de Sheets vs Postgres para cada módulo migrado.
 * Corre AMBAS fuentes independientemente y reporta la diferencia %.
 *
 * Uso:
 *   node scripts/validate-migration.js --modulo=obligaciones --periodo=2026-02
 *   node scripts/validate-migration.js --modulo=ventas       --periodo=2026-02
 *   node scripts/validate-migration.js --modulo=all          --periodo=2026-02
 *
 * Regla: diff < 0.1% → OK para mergear. Si no → reporta y NO commitear.
 *
 * ⚠️  Este script requiere acceso a AMBAS fuentes simultáneamente.
 *     Corre con las mismas vars de entorno que el servidor (incluye PG_* y GOOGLE_*).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { query, testConnection } = require('../src/dbClient');
const { readRange }             = require('../src/sheetsClient');

// ── Args ──────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => a.slice(2).split('='))
);

const MODULO  = args.modulo  || 'all';
const PERIODO = args.periodo || '2026-02';  // YYYY-MM

const [anio, mesNum] = PERIODO.split('-').map(Number);

const SP1 = process.env.SPREADSHEET_ID_1;
const SP2 = process.env.SPREADSHEET_ID_2;

// ── Utilidades ────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

/**
 * Calcula la diferencia porcentual entre dos valores.
 * @returns {{ diff: number, ok: boolean, label: string }}
 */
function calcDiff(valSheets, valPg) {
  if (valSheets === 0 && valPg === 0) return { diff: 0, ok: true,  label: '0.000%' };
  if (valSheets === 0)                return { diff: 100, ok: false, label: '100.000% (Sheets=0)' };
  const diff  = Math.abs((valPg - valSheets) / valSheets) * 100;
  const ok    = diff < 0.1;
  const label = `${diff.toFixed(3)}%`;
  return { diff, ok, label };
}

/**
 * Imprime el resultado de una comparación de forma estandarizada.
 */
function printResult({ modulo, kpi, valSheets, valPg, diff }) {
  const icon = diff.ok ? '✅' : '❌';
  console.log(`\n${icon}  [${modulo}] ${kpi}`);
  console.log(`   Sheets:   ${fmt.format(valSheets)}`);
  console.log(`   Postgres: ${fmt.format(valPg)}`);
  console.log(`   Diff:     ${diff.label} ${diff.ok ? '→ LISTO para mergear' : '→ INVESTIGAR antes de mergear'}`);
}

// ── Módulo 1: Obligaciones por vencer ────────────────────────────────────────
// Fuente Sheets: CarteraPorPagarDetalladaPorTercero!A:AZ (SP2)
// Fuente PG:     crisolweb.cartera_por_pagar
// KPI a validar: total saldo cartera por pagar
//
// ⏳ TODO: implementar cuando se confirmen los nombres de columna PG.
//    Pasos:
//    1. query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'crisolweb\' AND table_name=\'cartera_por_pagar\'')
//    2. Hacer SUM(saldo) WHERE saldo > 0
//    3. Comparar contra la suma de la columna 'Saldo' de Sheets

async function validateObligaciones() {
  console.log('\n══ MÓDULO 1: Obligaciones por vencer ══════════════════════════════');

  // ── Paso 0: Inspeccionar columnas de la tabla (no lanza error si falla) ──
  try {
    const { rows: cols } = await query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'crisolweb' AND table_name = 'cartera_por_pagar'
       ORDER BY ordinal_position`
    );
    console.log('\n   Columnas de crisolweb.cartera_por_pagar:');
    cols.forEach(c => console.log(`   · ${c.column_name} (${c.data_type})`));
  } catch (err) {
    console.error('   Error inspeccionando columnas:', err.message);
  }

  // ── TODO: Implementar comparación una vez confirmados los nombres ──
  console.log('\n   ⏳ Query de validación pendiente (nombres de columna por confirmar).');
  console.log('   Corre este script de nuevo después de que OpenClaw reporte el schema.');
}

// ── Módulo 2: Ventas hoy/mes ──────────────────────────────────────────────────
// Fuente Sheets: Facturacion_OP!A:AZ (SP1) — columnas ValorFacturado + fecha
// Fuente PG:     crisolweb.facturacion_op
// KPI a validar: suma total ventas feb 2026 ($420M esperado)
//
// ⏳ TODO: implementar cuando se confirmen los nombres de columna PG.
//    Pasos:
//    1. query('SELECT column_name ... WHERE table_name=\'facturacion_op\'')
//    2. SUM(valor_facturado) WHERE DATE_TRUNC('month', fecha) = '2026-02-01'
//    3. Comparar contra suma de 'ValorFacturado' de Sheets filtrado por feb 2026

async function validateVentas() {
  console.log('\n══ MÓDULO 2: Ventas del mes ════════════════════════════════════════');

  // ── Paso 0: Inspeccionar columnas ──
  try {
    const { rows: cols } = await query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'crisolweb' AND table_name = 'facturacion_op'
       ORDER BY ordinal_position`
    );
    console.log('\n   Columnas de crisolweb.facturacion_op:');
    cols.forEach(c => console.log(`   · ${c.column_name} (${c.data_type})`));
  } catch (err) {
    console.error('   Error inspeccionando columnas:', err.message);
  }

  // ── TODO: Implementar comparación ──
  console.log('\n   ⏳ Query de validación pendiente (nombres de columna por confirmar).');
  console.log('   Target feb 2026: ~$420.000.000');
}

// ── Runner principal ──────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' SCRIPT DE VALIDACIÓN — Sheets vs Postgres');
  console.log(` Período: ${PERIODO} | Módulo: ${MODULO}`);
  console.log('═══════════════════════════════════════════════════════════════════');

  // Verificar conexión PG
  const pg = await testConnection();
  if (!pg.ok) {
    console.error('\n❌ No se pudo conectar a PostgreSQL. Verifica PG_* o DATABASE_URL.');
    process.exit(1);
  }

  const modulosDisponibles = {
    obligaciones: validateObligaciones,
    ventas:       validateVentas,
  };

  if (MODULO === 'all') {
    for (const fn of Object.values(modulosDisponibles)) await fn();
  } else if (modulosDisponibles[MODULO]) {
    await modulosDisponibles[MODULO]();
  } else {
    console.error(`\n❌ Módulo desconocido: "${MODULO}". Opciones: ${Object.keys(modulosDisponibles).join(', ')}, all`);
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
