// gen-detalle-op.mjs
// Extrae el detalle linea por linea del reporte "PostCosteo por OP" (menuId: postcosteoop)
// y genera SQL de upsert para crisolweb.costo_por_orden_detalle
//
// Uso:  node gen-detalle-op.mjs 4732
//       node gen-detalle-op.mjs 4732 4708 4648      (varias OPs)
//
// Salida: /home/node/.openclaw/workspace/sql_historico/costo_por_orden_detalle.sql

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync('/home/node/.openclaw/workspace/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k&&v.length) envVars[k.trim()]=v.join('=').trim(); });
const CW_PASS = envVars['CRISOLWEB_PASSWORD'];
const CW_USER = 'Probolsas.openclaw';
const OUT_DIR = '/home/node/.openclaw/workspace/sql_historico';
const MENU_ID = 'postcosteoop';
const URL_MOD = 'https://crisolweb.net/ControlPiso';

const ops = process.argv.slice(2).filter(a => /^\d+$/.test(a));
if (!ops.length) { console.log('Uso: node gen-detalle-op.mjs 4732 [4708 ...]'); process.exit(1); }

fs.mkdirSync(OUT_DIR, { recursive: true });

const result_cantidades = [];

// ── HELPERS ───────────────────────────────────────────────────
const asNum = x => {
  if (x === undefined || x === null) return null;
  const s = String(x).trim().replace(/,/g, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const escVal = v => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
};

// Parser CSV que respeta comillas y saltos de linea internos
function parseCSVRaw(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const vacia = r => r.every(c => !String(c || '').trim());

// Localiza la fila de encabezado de cada seccion por su columna caracteristica
function findHeader(rows, colName) {
  return rows.findIndex(r => r.some(c => String(c || '').trim() === colName));
}

function sectionRows(rows, headerIdx) {
  const out = [];
  if (headerIdx === -1) return out;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    if (vacia(rows[i])) break;
    out.push(rows[i]);
  }
  return out;
}

// ── PARSERS POR SECCION ───────────────────────────────────────
function parseDetalle(csv, nro_op) {
  const rows = parseCSVRaw(csv);
  const meta = { _fuente: 'crisolweb', _id_externo: nro_op, _sync_origen: 'detalle_op' };
  const out = [];

  // Referencia: se toma del nombre del trabajo (col 0 de la 1a fila de mano de obra)
  const hMO = findHeader(rows, 'Actividad1');
  const filasMO = sectionRows(rows, hMO);
  const referencia = (filasMO[0]?.[0] || '').trim() || 'SIN_REF';

  // Mano de Obra
  for (const r of filasMO) {
    const item = (r[1] || '').trim();
    if (!item) continue;
    out.push({
      nro_op, referencia, categoria: 'mano_obra', item,
      unidad: (r[2] || '').trim() || null,
      cant_cotizada: asNum(r[3]), valor_cotizado: asNum(r[4]),
      cant_ejecutada: asNum(r[5]), cant_ejec_cw: asNum(r[7]),
      valor_ejecutado: asNum(r[9]),
      valor_ejec_operario: asNum(r[6]), valor_ejec_cw: asNum(r[8]),
      cumplimiento: asNum(r[10]), ...meta
    });
  }

  // Materiales
  for (const r of sectionRows(rows, findHeader(rows, 'Material'))) {
    const item = (r[0] || '').trim();
    if (!item) continue;
    out.push({
      nro_op, referencia, categoria: 'material', item, unidad: null,
      cant_cotizada: asNum(r[1]), valor_cotizado: asNum(r[2]),
      cant_ejecutada: asNum(r[3]), cant_ejec_cw: null,
      valor_ejecutado: asNum(r[4]),
      valor_ejec_operario: null, valor_ejec_cw: null,
      cumplimiento: asNum(r[5]), ...meta
    });
  }

  // Cantidades del resumen (para ajuste por volumen)
  const hRes = findHeader(rows, 'Concepto');
  if (hRes !== -1) {
    for (const r of sectionRows(rows, hRes)) {
      if ((r[0] || '').trim() === 'Cantidades') {
        const cc = asNum(r[1]), ce = asNum(r[2]);
        if (ce > 0) result_cantidades.push({ nro_op, cc, ce });
      }
    }
  }

  // Terceros
  for (const r of sectionRows(rows, findHeader(rows, 'Proceso'))) {
    const item = (r[1] || '').trim();
    if (!item) continue;
    out.push({
      nro_op, referencia, categoria: 'tercero', item,
      unidad: (r[2] || '').trim() || null,
      cant_cotizada: asNum(r[3]), valor_cotizado: asNum(r[4]),
      cant_ejecutada: asNum(r[5]), cant_ejec_cw: null,
      valor_ejecutado: asNum(r[6]),
      valor_ejec_operario: null, valor_ejec_cw: null,
      cumplimiento: asNum(r[7]), ...meta
    });
  }

  return out;
}

function rowsToSQL(rows) {
  if (!rows.length) return '';
  // Líneas repetidas (misma OP, referencia, categoría e ítem): se numeran "(2)", "(3)"... en vez de perderse
  const vistos = {};
  rows = rows.map(r => {
    const k = [r.nro_op, r.referencia, r.categoria, r.item].join('|');
    vistos[k] = (vistos[k] || 0) + 1;
    return vistos[k] > 1 ? { ...r, item: `${r.item} (${vistos[k]})` } : r;
  });
  const cols = Object.keys(rows[0]);
  const pk = ['nro_op','referencia','categoria','item'];
  const sets = cols.filter(c => !pk.includes(c)).map(c => `${c}=EXCLUDED.${c}`).join(',\n  ');
  const sqls = [];
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const values = batch.map(r => '(' + cols.map(c => escVal(r[c])).join(', ') + ')').join(',\n  ');
    sqls.push(
`INSERT INTO crisolweb.costo_por_orden_detalle (${cols.join(', ')})
VALUES
  ${values}
ON CONFLICT (nro_op, referencia, categoria, item) DO UPDATE SET
  ${sets},
  _sync_fecha = NOW();`);
  }
  return sqls.join('\n\n');
}

// ── DESCARGA ──────────────────────────────────────────────────
async function descargarCSVporOP(page, context, nroOp) {
  let csvResolve, csvReject;
  const csvPromise = new Promise((res, rej) => { csvResolve = res; csvReject = rej; });
  const timer = setTimeout(() => csvReject(new Error('timeout 300s')), 300000);

  await context.route('**/*OpType=Export*Format=CSV*', async route => {
    const resp = await route.fetch(); const body = await resp.text();
    clearTimeout(timer); csvResolve(body);
    await route.fulfill({ response: resp, body });
  });

  await page.goto(URL_MOD, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(id => {
    const el = document.getElementById(id);
    let p = el; while (p) { if (p.style) p.style.display = ''; p = p.parentElement; } el.click();
  }, MENU_ID);

  let frame = null;
  for (let i = 0; i < 15; i++) {
    for (const f of page.frames()) { if (f.url().includes('ReportViewer')) { frame = f; break; } }
    if (frame) break; await page.waitForTimeout(1000);
  }
  if (!frame) { await context.unroute('**/*OpType=Export*Format=CSV*'); throw new Error('no ReportViewer frame'); }
  await page.waitForTimeout(3000);
  for (let i = 0; i < 20; i++) {
    const ok = await frame.evaluate(() => !!document.getElementById('ReportViewer1_ctl05')).catch(() => false);
    if (ok) break; await page.waitForTimeout(1000);
  }

  // Llenar el UNICO parametro: numero de OP
  await frame.evaluate(op => {
    const inputs = [...document.querySelectorAll('input[id*="txtValue"]')];
    if (inputs.length >= 1) {
      inputs[0].value = op;
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, String(nroOp));
  await frame.evaluate(() => { document.getElementById('ReportViewer1_ctl04_ctl00')?.click(); });
  for (let i = 0; i < 30; i++) {
    const loading = await frame.evaluate(() => { const w = document.getElementById('ReportViewer1_AsyncWait'); return w && w.style.display !== 'none'; }).catch(() => false);
    if (!loading) break; await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2000);

  await frame.evaluate(() => { document.getElementById('ReportViewer1_ctl05_ctl04_ctl00_ButtonLink')?.click(); });
  await frame.waitForTimeout(500);
  await frame.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find(a => (a.getAttribute('onclick') || '').includes("exportReport('CSV')"));
    if (link) link.click();
  });
  const csv = await csvPromise;
  await context.unroute('**/*OpType=Export*Format=CSV*');
  return csv;
}

// ── MAIN ──────────────────────────────────────────────────────
console.log(`Detalle por OP: ${ops.join(', ')}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://crisolweb.net/Seguridad/Login', { waitUntil: 'networkidle' });
await page.fill('input[type="text"]', CW_USER);
await page.fill('input[type="password"]', CW_PASS);
await page.click('button[type="submit"], input[type="submit"]');
await page.waitForTimeout(3000);
if (page.url().includes('Login')) { console.log('Login fallido'); process.exit(1); }
console.log('Login OK\n');

const sqlFile = path.join(OUT_DIR, 'costo_por_orden_detalle.sql');
const fd = fs.openSync(sqlFile, 'w');
fs.writeSync(fd, `-- UPSERT detalle por OP: crisolweb.costo_por_orden_detalle\n-- Generado: ${new Date().toISOString()}\n-- OPs: ${ops.join(', ')}\n\n`);

let totalFilas = 0;
let okCount = 0;
for (const op of ops) {
  process.stdout.write(`  OP ${op}: `);
  try {
    const csv = await descargarCSVporOP(page, context, op);
    const rows = parseDetalle(csv, op);
    if (!rows.length) { console.log('0 filas (revisar)'); continue; }
    fs.writeSync(fd, `-- OP ${op}: ${rows.length} lineas\n${rowsToSQL(rows)}\n\n`);
    const porCat = rows.reduce((a, r) => { a[r.categoria] = (a[r.categoria] || 0) + 1; return a; }, {});
    console.log(`OK ${rows.length} lineas (MO:${porCat.mano_obra||0} MAT:${porCat.material||0} TER:${porCat.tercero||0})`);
    totalFilas += rows.length; okCount++;
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.log(`ERROR ${e.message.substring(0, 60)}`);
    try {
      await page.goto('https://crisolweb.net/', { waitUntil: 'networkidle', timeout: 15000 });
      if (page.url().includes('Login')) {
        await page.fill('input[type="text"]', CW_USER);
        await page.fill('input[type="password"]', CW_PASS);
        await page.click('button[type="submit"], input[type="submit"]');
        await page.waitForTimeout(3000);
      }
    } catch (_) {}
  }
}

if (result_cantidades.length) {
  fs.writeSync(fd, `-- Cantidades producidas por OP (para ajuste por volumen)\n`);
  for (const c of result_cantidades) {
    fs.writeSync(fd, `UPDATE crisolweb.costo_por_orden SET cantidad_cotizada=${c.cc === null ? 'NULL' : c.cc}, cantidad_ejecutada=${c.ce}, _sync_fecha=NOW() WHERE nro_op='${c.nro_op}';\n`);
  }
  fs.writeSync(fd, `\n`);
}

fs.closeSync(fd);
await browser.close();

const size = (fs.statSync(sqlFile).size / 1024).toFixed(0);
console.log(`\nArchivo: ${sqlFile} (${size}KB, ${totalFilas} lineas de ${okCount}/${ops.length} OPs)`);
if (totalFilas === 0) { console.error('ERROR: 0 filas generadas'); process.exit(1); }

