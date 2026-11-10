import { chromium } from 'playwright';
import fs from 'fs';
import crypto from 'crypto';

const WORK = '/home/node/.openclaw/workspace';
const OUT = `${WORK}/tmp_crisol_movimientos`;
const ENV_FILE = `${WORK}/.env`;

const FI = process.env.FI || '01/08/2026';
const FF = process.env.FF || '18/08/2026';

fs.mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const p = line.indexOf('=');
  if (p > 0) env[line.slice(0, p).trim()] = line.slice(p + 1).trim();
}

const USER = env.CRISOLWEB_USER || 'Probolsas.openclaw';
const PASS = env.CRISOLWEB_PASSWORD;

if (!PASS) throw new Error('CRISOLWEB_PASSWORD no encontrada');

function norm(v = '') {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        quoted = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) return { headers: [], data: [] };

  const headers = rows[0].map(v =>
    String(v).replace(/^\uFEFF/, '').trim()
  );

  const data = rows
    .slice(1)
    .filter(r => r.some(v => String(v).trim()))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(r[i] ?? '').trim();
      });
      return obj;
    });

  return { headers, data };
}

function parseDate(v) {
  const s = String(v || '').trim();

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  return null;
}

function isoDate(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  console.log('1. LOGIN');

  await page.goto('https://crisolweb.net/Seguridad/Login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.fill('input[type="text"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"], input[type="submit"]');

  await page.waitForTimeout(3000);

  console.log('2. LOGIN OK');

  await page.goto('https://crisolweb.net/Inventario', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForSelector('#movimientodosmateriales', {
    state: 'attached', timeout: 60000
  });

  console.log('3. MENU OK');

  await page.evaluate(() => {
    const el = document.getElementById('movimientodosmateriales');
    if (!el) throw new Error('movimientodosmateriales no encontrado');

    let p = el;
    while (p) {
      if (p.style) p.style.display = '';
      p = p.parentElement;
    }

    el.click();
  });

  let frame = null;

  for (let i = 0; i < 30; i++) {
    frame = page.frames().find(f => f.url().includes('ReportViewer'));
    if (frame) break;
    await page.waitForTimeout(1000);
  }

  if (!frame) throw new Error('ReportViewer no encontrado');

  await page.waitForTimeout(3000);

  console.log('4. REPORTVIEWER OK');

  const controls = await frame.evaluate(() => {
    return [...document.querySelectorAll('input,select')].map(el => ({
      tag: el.tagName,
      id: el.id || '',
      name: el.name || '',
      type: el.type || '',
      value: el.value || '',
      row: el.closest('tr')?.innerText || '',
      options: el.tagName === 'SELECT'
        ? [...el.options].map(o => ({
            value: o.value,
            text: o.text
          }))
        : []
    }));
  });

  fs.writeFileSync(
    `${OUT}/controles_v2.json`,
    JSON.stringify(controls, null, 2)
  );

  const findControl = (tag, terms) => {
    const matches = controls.filter(c => {
      if (c.tag !== tag) return false;

      const text = norm(`${c.row} ${c.id} ${c.name}`);

      return terms.every(t => text.includes(norm(t)));
    });

    return matches.length === 1 ? matches[0] : null;
  };

  const fechaInicio = {
    id: 'ReportViewer1_ctl04_ctl03_txtValue'
  };

  const fechaFin = {
    id: 'ReportViewer1_ctl04_ctl05_txtValue'
  };

  const bodega = {
    id: 'ReportViewer1_ctl04_ctl07_ddValue'
  };

  const origen = {
    id: 'ReportViewer1_ctl04_ctl13_ddValue'
  };

  console.log('\nCONTROLES IDENTIFICADOS');
  console.log('Fecha Mov Inicio:', fechaInicio?.id || 'NO');
  console.log('Fecha Mov Fin   :', fechaFin?.id || 'NO');
  console.log('Bodega          :', bodega?.id || 'NO');
  console.log('Origen          :', origen?.id || 'NO');

  if (!fechaInicio || !fechaFin || !bodega || !origen) {
    throw new Error(
      `No se identificaron inequívocamente los cuatro filtros. Revisar ${OUT}/controles_v2.json`
    );
  }

  async function setInput(control, value) {
    const nullId =
      control.id.replace(/_txtValue$/, '_cbNull');

    const nullBox = frame.locator('#' + nullId);

    if (await nullBox.count()) {
      const checked =
        await nullBox.isChecked().catch(() => false);

      if (checked) {
        await nullBox.uncheck({ force: true });
      }
    }

    const loc = frame.locator('#' + control.id);

    await loc.fill(value);
    await loc.dispatchEvent('input');
    await loc.dispatchEvent('change');
    await loc.dispatchEvent('blur');
  }

  async function selectText(control, wanted) {
    const result = await frame.evaluate(({ id, wanted }) => {
      const el = document.getElementById(id);
      if (!el) return null;

      const n = s => String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const exact = [...el.options].find(
        o => n(o.text) === n(wanted)
      );

      const partial = [...el.options].find(
        o => n(o.text).includes(n(wanted))
      );

      const opt = exact || partial;
      if (!opt) return null;

      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        value: opt.value,
        text: opt.text
      };
    }, { id: control.id, wanted });

    if (!result) {
      throw new Error(
        `No se encontró "${wanted}" en ${control.id}`
      );
    }

    return result;
  }

  await setInput(fechaInicio, FI);
  await setInput(fechaFin, FF);

  const bodegaSeleccionada =
    await selectText(bodega, 'Todas las Bodegas');

  const origenSeleccionado =
    await selectText(origen, 'Todos');

  console.log('\n5. FILTROS APLICADOS');
  console.log('Fecha:', FI, '→', FF);
  console.log('Bodega:', bodegaSeleccionada.text);
  console.log('Origen:', origenSeleccionado.text);

  await frame
    .locator('#ReportViewer1_ctl04_ctl00')
    .click({ timeout: 15000 });

  console.log('6. GENERANDO REPORTE');

  let listo = false;

  for (let i = 0; i < 120; i++) {
    const state = await frame.evaluate(() => {
      const wait = document.getElementById('ReportViewer1_AsyncWait');
      const toolbar = document.getElementById('ReportViewer1_ctl05');

      return {
        loading: !!wait && wait.style.display !== 'none',
        toolbar: !!toolbar
      };
    }).catch(() => ({
      loading: true,
      toolbar: false
    }));

    if (!state.loading && state.toolbar) {
      listo = true;
      break;
    }

    await page.waitForTimeout(1000);
  }

  if (!listo) throw new Error('Timeout generando reporte');

  console.log('7. REPORTE OK');

  let csvBody = null;

  const handler = async route => {
    const resp = await route.fetch();
    const body = await resp.text();

    if (
      !csvBody &&
      body.includes('Consecutivo') &&
      body.includes('TipoMovimiento')
    ) {
      csvBody = body;
    }

    await route.fulfill({
      response: resp,
      body
    });
  };

  await context.route('**/*Format=CSV*', handler);

  await frame.evaluate(() => {
    document
      .getElementById('ReportViewer1_ctl05_ctl04_ctl00_ButtonLink')
      ?.click();
  });

  await page.waitForTimeout(700);

  await frame.evaluate(() => {
    const link = [...document.querySelectorAll('a')]
      .find(a =>
        (a.getAttribute('onclick') || '')
          .includes("exportReport('CSV')")
      );

    if (!link) throw new Error('Opción CSV no encontrada');

    link.click();
  });

  for (let i = 0; i < 90 && !csvBody; i++) {
    await page.waitForTimeout(1000);
  }

  await context.unroute('**/*Format=CSV*', handler);

  if (!csvBody) throw new Error('CSV no capturado');

  console.log('8. CSV CAPTURADO');

  const { headers, data } = parseCSV(csvBody);

  const expected = [
    'Consecutivo',
    'Fecha',
    'FechaContable',
    'Material',
    'TipoMovimiento',
    'Concepto',
    'Entradas',
    'Salida',
    'Precio',
    'ValorTotal',
    'Lote',
    'Origen',
    'Documento',
    'Tercero',
    'Bodega'
  ];

  const faltantes = expected.filter(h => !headers.includes(h));

  const inicio = parseDate(FI);
  const fin = parseDate(FF);

  let min = null;
  let max = null;
  let fuera = 0;
  let fechasInvalidas = 0;

  for (const r of data) {
    const d = parseDate(r.Fecha);

    if (!d) {
      fechasInvalidas++;
      continue;
    }

    if (!min || d < min) min = d;
    if (!max || d > max) max = d;

    if (d < inicio || d > fin) fuera++;
  }

  const file =
    `${OUT}/movimientos_todos_materiales_` +
    `${isoDate(inicio)}_${isoDate(fin)}.csv`;

  fs.writeFileSync(file, csvBody);

  const sha256 = crypto
    .createHash('sha256')
    .update(csvBody)
    .digest('hex');

  const result = {
    archivo: file,
    bytes: fs.statSync(file).size,
    sha256,
    filas: data.length,
    headers,
    headersFaltantes: faltantes,
    fechaSolicitadaInicio: FI,
    fechaSolicitadaFin: FF,
    fechaMinimaCSV: isoDate(min),
    fechaMaximaCSV: isoDate(max),
    filasFueraDelPeriodo: fuera,
    fechasInvalidas,
    primeraFila: data[0] || null,
    ultimaFila: data[data.length - 1] || null
  };

  fs.writeFileSync(
    `${OUT}/resultado_v2.json`,
    JSON.stringify(result, null, 2)
  );

  console.log('\n========== RESULTADO ==========');
  console.log(JSON.stringify(result, null, 2));

  if (faltantes.length) {
    console.error('\n❌ FALTAN HEADERS');
    process.exitCode = 3;
  } else if (fuera > 0) {
    console.error('\n❌ FILTRO DE FECHAS INCORRECTO');
    process.exitCode = 2;
  } else {
    console.log('\n✅ CSV Y FILTRO DE FECHAS VALIDADOS');
  }

} catch (err) {
  console.error('\n❌ ERROR REAL');
  console.error(err?.stack || err);
  process.exitCode = 1;

} finally {
  await browser.close();
}
