// cron-ordenes-cumplidas.mjs — scraping diario + genera SQL
import { chromium } from 'playwright';
import fs from 'fs';
import { execSync } from 'child_process';

const envContent = fs.readFileSync('/home/node/.openclaw/workspace/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k&&v.length) envVars[k.trim()]=v.join('=').trim(); });
const CW_PASS = envVars['CRISOLWEB_PASSWORD'];
const CW_USER = 'Probolsas.openclaw';

// Rango: últimos 7 días → hoy (cubre huecos de fin de semana)
const hoy = new Date();
const desde = new Date(hoy); desde.setDate(hoy.getDate() - 7);
const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
const FI = process.env.FI || fmt(desde), FF = process.env.FF || fmt(hoy); // FI/FF opcionales para rellenos
const OUT = '/home/node/.openclaw/workspace';
const URL = 'https://crisolweb.net/Produccion';
const MENU_ID = 'ordenesCumplidas';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://crisolweb.net/Seguridad/Login', { waitUntil: 'networkidle' });
await page.fill('input[type="text"]', CW_USER);
await page.fill('input[type="password"]', CW_PASS);
await page.click('button[type="submit"], input[type="submit"]');
await page.waitForTimeout(3000);
console.log('✅ Login');

let csvBody = null;
await context.route('**/*Format=CSV*', async route => {
  const resp = await route.fetch();
  const body = await resp.text();
  const lines = body.split('\n').filter(l=>l.trim());
  if (lines.length > 1 && lines[0].includes(',') && !csvBody) csvBody = body;
  await route.fulfill({ response: resp, body });
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);

const clicked = await page.evaluate(id => {
  const el = document.getElementById(id);
  if (!el) return false;
  let p = el; while (p) { if (p.style) p.style.display = ''; p = p.parentElement; }
  el.click(); return true;
}, MENU_ID);
if (!clicked) { console.log(`❌ menú ${MENU_ID} no encontrado`); await browser.close(); process.exit(1); }
console.log(`✅ Click en ${MENU_ID}`);

let frame = null;
for (let i=0;i<20;i++){ for(const f of page.frames()){ if(f.url().includes('ReportViewer')){frame=f;break;} } if(frame)break; await page.waitForTimeout(1000); }
if (!frame) { console.log('❌ no apareció ReportViewer'); await browser.close(); process.exit(1); }
console.log('✅ ReportViewer cargado');

await page.waitForTimeout(3000);
for (let i=0;i<20;i++){ const ok=await frame.evaluate(()=>!!document.getElementById('ReportViewer1_ctl05')).catch(()=>false); if(ok)break; await page.waitForTimeout(1000); }

await frame.evaluate(({fi,ff})=>{
  const ins=[...document.querySelectorAll('input[id*="txtValue"]')];
  if(ins.length>=2){ins[0].value=fi;ins[1].value=ff;ins.forEach(i=>{i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('blur',{bubbles:true}));});}
},{fi:FI,ff:FF});
console.log(`✅ Rango ${FI} → ${FF}`);
await frame.evaluate(()=>{document.getElementById('ReportViewer1_ctl04_ctl00')?.click();});
for(let i=0;i<40;i++){const loading=await frame.evaluate(()=>{const w=document.getElementById('ReportViewer1_AsyncWait');return w&&w.style.display!=='none';}).catch(()=>false);if(!loading)break;await page.waitForTimeout(1500);}
await page.waitForTimeout(2000);

await frame.evaluate(()=>{document.getElementById('ReportViewer1_ctl05_ctl04_ctl00_ButtonLink')?.click();});
await frame.waitForTimeout(800);
await frame.evaluate(()=>{const l=[...document.querySelectorAll('a')].find(a=>(a.getAttribute('onclick')||'').includes("exportReport('CSV')"));if(l)l.click();});

for(let i=0;i<60&&!csvBody;i++) await page.waitForTimeout(1000);
await browser.close();

if (!csvBody) { console.log('❌ No se capturó CSV'); process.exit(1); }
fs.writeFileSync(`${OUT}/inspect_ordenes_cumplidas.csv`, csvBody);
const filas = csvBody.split('\n').filter(l=>l.trim()).length - 1;
console.log(`✅ CSV: ${filas} filas`);

// Genera el SQL inmediatamente
execSync('node /home/node/.openclaw/workspace/gen-sql-ordenes-cumplidas.mjs', {stdio:'inherit'});
console.log('✅ SQL generado, listo para aplicar');
