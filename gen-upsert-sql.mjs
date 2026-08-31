
// gen-upsert-sql.mjs
// Descarga CSVs de Crisolweb y genera archivos SQL de UPSERT listos para ejecutar
// Uso: node gen-upsert-sql.mjs [tabla]
// Ejemplo: node gen-upsert-sql.mjs facturas
// Sin argumento: genera todas las tablas en secuencia

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync('/home/node/.openclaw/workspace/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k&&v.length) envVars[k.trim()]=v.join('=').trim(); });
const CW_PASS = envVars['CRISOLWEB_PASSWORD'];
const CW_USER = 'Probolsas.openclaw';
const OUT_DIR = '/home/node/.openclaw/workspace/sql_historico';
const BLOQUE_NOMBRE = process.env.BLOQUE_NOMBRE || null;

fs.mkdirSync(OUT_DIR, { recursive: true });

// Fecha de hoy dinámica (dd/mm/yyyy)
const hoy = new Date();
const HOY_STR = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;

// Modo sync diario: solo últimos 35 días
const fechaInicio35 = new Date(hoy); fechaInicio35.setDate(hoy.getDate() - 35);
const FI_35 = `${String(fechaInicio35.getDate()).padStart(2,'0')}/${String(fechaInicio35.getMonth()+1).padStart(2,'0')}/${fechaInicio35.getFullYear()}`;

// TRAMOS históricos completos (para carga inicial o forzar todo con --historico)
const TRAMOS_HISTORICO = [
  { nombre: 'abr-may-2026', fi: '15/04/2026', ff: '16/05/2026' },
  { nombre: 'may2-2026', fi: '17/05/2026', ff: '31/05/2026' },
  { nombre: 'jun1-2026', fi: '01/06/2026', ff: '15/06/2026' },
  { nombre: 'jun2-2026', fi: '16/06/2026', ff: '30/06/2026' },
  { nombre: 'jul1-2026', fi: '01/07/2026', ff: '15/07/2026' },
  { nombre: 'jul2-2026', fi: '16/07/2026', ff: '31/07/2026' },
  { nombre: 'ago-2026',  fi: '01/08/2026', ff: HOY_STR },
];

// Modo por defecto (cron diario): solo últimos 35 días → hoy
const TRAMOS_DIARIO = [
  { nombre: 'ultimo_35dias', fi: FI_35, ff: HOY_STR },
];

const modoHistorico = process.argv.includes('--historico');
const TRAMOS = modoHistorico ? TRAMOS_HISTORICO : TRAMOS_DIARIO;

console.log(`📅 Modo: ${modoHistorico ? 'HISTÓRICO COMPLETO' : `DIARIO (${FI_35} → ${HOY_STR})`}`);

const REPORTES = [
  { tabla: 'costo_por_orden',       menuId: 'postcosteodetalladoop', url: 'https://crisolweb.net/ControlPiso', dates: true,  upsertKey: ['nro_op','referencia'] },
  { tabla: 'ordenes_cumplidas',         menuId: 'ctlpisounidadescumplidasop', url: 'https://crisolweb.net/ControlPiso', dates: true,  upsertKey: ['nro_orden','referencia'] },
  { tabla: 'facturas',              menuId: 'listadoFacturas',       url: 'https://crisolweb.net/Facturacion', dates: true,  upsertKey: ['consecutivo'] },
  { tabla: 'ingresos',              menuId: 'listadoingresos',       url: 'https://crisolweb.net/Facturacion', dates: true,  upsertKey: ['nro_recibo'] },
  { tabla: 'facturacion_op',        menuId: 'facturacionop',         url: 'https://crisolweb.net/Facturacion', dates: true,  upsertKey: ['nro_op','referencia'] },
  { tabla: 'consecutivo_cxp',       menuId: 'consecxp',              url: 'https://crisolweb.net/Egresos',     dates: true,  upsertKey: ['nro_documento'] },
  { tabla: 'consecutivo_egresos',   menuId: 'conseegresos',          url: 'https://crisolweb.net/Egresos',     dates: true,  upsertKey: ['nro_documento'] },
  { tabla: 'analisis_cotizaciones', menuId: 'AnalisisCotizaciones',  url: 'https://crisolweb.net/Cotizacion',  dates: true,  upsertKey: ['nro_cotizacion','trabajo'] },
  { tabla: 'cartera_por_pagar',         menuId: 'carteraporpagardetallada', url: 'https://crisolweb.net/Egresos', dates: false, upsertKey: ['nro_factura','nombre'] },
  { tabla: 'egresos_agrupados_concepto', menuId: 'egresoagrupadoconcepto',   url: 'https://crisolweb.net/Egresos',    dates: true,  upsertKey: ['concepto','fecha_contable'] },
];

// Filtrar por argumento si se pasa
const tablaArg = process.argv[2];
const reportesACorrer = tablaArg
  ? REPORTES.filter(r => r.tabla === tablaArg)
  : REPORTES;

if (tablaArg && reportesACorrer.length === 0) {
  console.log(`❌ Tabla "${tablaArg}" no encontrada. Opciones: ${REPORTES.map(r=>r.tabla).join(', ')}`);
  process.exit(1);
}

// ── MAPEOS CSV → SQL ──────────────────────────────────────────
const MAPEOS = {
  facturas: r => ({
    consecutivo:       r['Consecutivo']||null,
    nombre:            r['Nombre']||null,
    vendedor:          r['Vendedor']||null,
    fecha_creacion:    parseDate(r['FechaCreacion']),
    fecha_vencimiento: parseDate(r['FechaVencimiento']),
    valor_bruto:       parseNum(r['ValorBruto']),
    total_descuento:   parseNum(r['TotalDescuento']),
    valor_iva:         parseNum(r['ValorIva']),
    valor_neto:        parseNum(r['ValorNeto']),
    estado:            r['Estado']||null,
    _fuente: 'crisolweb', _id_externo: r['Consecutivo']||null, _sync_origen: 'historico_2025',
  }),
  ingresos: r => ({
    vendedor:          r['Vendedor1']||r['Vendedor']||null,
    nro_recibo:        r['Consecutivo']||null,                         // fix: era r['Nro'] → NULL
    fecha_creacion:    parseDate(r['Fecha']),                          // fix: era r['FechaCreacion'] → NULL
    concepto:          r['Concepto']||null,
    cliente:           r['Cliente']||r['Tercero']||r['Nombre']||null,
    valor_recibido:    parseNum(r['ValorRecibido']||r['Valor']),
    estado:            r['Estado']||null,
    liquidacion:       r['IngresoLiquidacion']||r['Liquidacion']||null,
    _fuente: 'crisolweb', _id_externo: r['Consecutivo']||null,        // fix: era r['Nro'] → NULL
    _sync_origen: 'historico_2025',
  }),
  facturacion_op: r => ({
    // Headers reales: Factura,OrdenProduccion,OrdenCompra,Descripcion,Cliente,LineaProducto,TipoProducto,
    // CantidadFacturada,ValorUnitario,CostoUnitarioTeorico,ValorFacturado,Nit,FechaContable,FechaVencimiento,Vendedor
    nro_op:            r['Factura']||null,
    referencia:        r['OrdenProduccion']||r['OrdenCompra']||null,
    cliente:           r['Cliente']||null,
    vendedor:          r['Vendedor']||null,
    fecha_creacion:    parseDate(r['FechaContable']),
    fecha_vencimiento: parseDate(r['FechaVencimiento']),
    valor_bruto:       parseNum(r['ValorFacturado']),
    valor_neto:        parseNum(r['ValorFacturado']),
    estado:            null,
    _fuente: 'crisolweb', _sync_origen: 'historico_2025',
  }),
  consecutivo_cxp: r => ({
    // Headers reales: DetalleLiquidacion,Consecutivo1,Tercero,Concepto,NroFactura,Detalle,PeriodoRegistro,Vencimiento,ValorNeto,Iva,ValorTotal,...
    nro_documento:     r['NroFactura']||r['Consecutivo1']||null,
    proveedor:         r['Tercero']||null,
    fecha_contable:    parseDate(r['PeriodoRegistro']),
    fecha_vencimiento: parseDate(r['Vencimiento']),
    valor_a_pagar:     parseNum(r['ValorTotal']||r['ValorNeto']),
    saldo:             parseNum(r['Valor1']||r['ValorNeto']),
    dias_vencido:      0,
    liquidacion:       r['DetalleLiquidacion']||null,
    _fuente: 'crisolweb', _sync_origen: 'historico_2025',
  }),
  consecutivo_egresos: r => ({
    // Headers reales: Egreso1,Tercero1,Concepto1,Fecha1,MedioPago1,NetoPagar2,Detalle1,EgresoLiquidacion,ValorLiquidacion,NetoPagar3
    nro_documento:     r['Egreso1']||null,
    proveedor:         r['Tercero1']||null,
    fecha_contable:    parseDate(r['Fecha1']),
    concepto:          r['Concepto1']||null,
    valor:             parseNum(r['NetoPagar2']),
    liquidacion:       r['EgresoLiquidacion']||null,
    _fuente: 'crisolweb', _sync_origen: 'historico_2025',
  }),
  analisis_cotizaciones: r => ({
    vendedor:          r['Vendedor1']||r['Vendedor']||null,
    nro_cotizacion:    r['Nro']||r['NroCotizacion']||null,
    fecha_creacion:    parseDate(r['FechaCreacion']||r['Fecha']),
    trabajo:           r['Trabajo']||r['Referencia']||null,
    cliente:           r['Cliente']||null,
    cantidad:          parseNum(r['Cantidad']),
    vr_unit:           parseNum(r['VrUnit']||r['VrUnitario']),
    vr_total:          parseNum(r['VrTotal']||r['VrTotales']),
    aprobado:          r['Aprobado']||null,
    _fuente: 'crisolweb', _sync_origen: 'historico_2025',
  }),
  costo_por_orden: r => ({
    // Headers reales (confirmados 2026-05):
    // NroOrdenProduccion1,NombreTrabajo1,Cliente1,CantidadCotizada1,CostoTotalEstimado,
    // Comision1,ValorTotal1,CantidadCumplida,CostoTotalEjecutado2,CostoTotalEjecutado1,
    // ValorCumplido,DifEjecutado,Textbox15(margen%),
    // CostoEjecutadoMDO,CostoEjecutadoMP,CostoEjecutadoTercero,CostoEjecutadoIndirecto,
    // Vendedor,FechaInicioOP,FechaFinOP
    nro_op:                  r['NroOrdenProduccion1']||null,
    referencia:              r['NombreTrabajo1']||null,
    descripcion:             r['NombreTrabajo1']||null,
    fecha:                   parseDate(r['FechaFinOP']||r['FechaInicioOP']),  // FechaFinOP es la clave
    costo_material:          parseNum(r['CostoEjecutadoMP']),
    costo_mo:                parseNum(r['CostoEjecutadoMDO']),
    costo_cif:               parseNum(r['CostoEjecutadoIndirecto']),
    costo_total:             parseNum(r['CostoTotalEjecutado2']||r['CostoTotalEstimado']),
    costo_total_estimado:    parseNum(r['CostoTotalEstimado']),
    valor_cumplido:          parseNum(r['ValorCumplido']),
    costo_ejecutado_total:   parseNum(r['CostoTotalEjecutado1']||r['CostoTotalEjecutado2']),
    cliente:                 r['Cliente1']||null,
    margen_pct:              parseNum((r['Textbox15']||'').replace('%','').trim()),
    _fuente: 'crisolweb', _sync_origen: 'cron_diario',
  }),
  cartera_por_pagar: r => ({
    nombre:            r['Nombre']||null,
    nro_factura:       r['NroFactura1']||r['NroDocumento']||null,
    fecha_contable:    parseDate(r['FechaContable']||r['Fecha']),
    fecha_vencimiento: parseDate(r['FechaVencimiento']),
    valor_a_pagar:     parseNum(r['ValorAPagar']||r['ValorAPagar1']),
    saldo:             parseNum(r['Saldo']||r['Saldo1']),
    dias_vencido:      parseInt(r['DiasVencidos']||'0')||0,
    _fuente: 'crisolweb', _sync_origen: 'historico_2025',
  }),
  ordenes_cumplidas: r => {
    const nro = (r['NroOrdenProduccion']||'').trim();
    if (!nro) return null;
    return {
      nro_orden:          nro,
      referencia:         r['CodigoProducto']||r['CodigoPedido']||r['NombreTrabajo']||null,
      cliente:            r['Cliente']||null,
      fecha_creacion:     parseDate(r['FechaAprobacion1']?.split('/').length===3 ? `${r['FechaAprobacion1'].split('/')[2]}-${r['FechaAprobacion1'].split('/')[0].padStart(2,'0')}-${r['FechaAprobacion1'].split('/')[1].padStart(2,'0')}` : null),
      fecha_cumplimiento: parseDate(r['UltimoCumplido']?.split('/').length===3 ? `${r['UltimoCumplido'].split('/')[2]}-${r['UltimoCumplido'].split('/')[0].padStart(2,'0')}-${r['UltimoCumplido'].split('/')[1].padStart(2,'0')}` : null),
      cantidad_pedida:    parseNum(r['CantidadAprobada']),
      cantidad_cumplida:  parseNum(r['CantidadCumplida1']),
      dias_vencido:       parseInt(r['DiasVencidos1']||'0')||0,
      valor_total:        null,
      vendedor:           null,
      _fuente: 'crisolweb', _sync_origen: 'cron_diario',
    };
  },
  egresos_agrupados_concepto: r => {
    const fecha = parseDate(r['Fecha']||r['FechaContable']);
    if (!fecha) return null;
    const [anio, mes] = fecha.split('-').map(Number);
    // Detectar anulados: el campo Egreso contiene "(Anulado)"
    const egresoRaw = String(r['Egreso']||r['Egreso1']||'');
    if (egresoRaw.toLowerCase().includes('anulado')) return null;
    const monto = parseNum(r['NetoPagar']||r['NetoPagar2']||r['Valor']);
    if (!monto || monto <= 0) return null;
    return {
      concepto:          r['Concepto']||null,
      mes,
      anio,
      fecha_contable:    fecha,
      total_egresos:     monto,
      nro_transacciones: 1,
      _fuente: 'crisolweb',
      _id_externo: `${r['Concepto']}_${mes}_${anio}`,
      _sync_origen: 'cron_diario',
    };
  },
};

// ── HELPERS ───────────────────────────────────────────────────
function parseDate(s) {
  if (!s||s.trim()==='') return null;
  const p=s.trim().split('/');
  if(p.length===3){const[d,m,y]=p;return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  return null;
}
function parseNum(s) {
  if (!s||s.trim()==='') return null;
  const n=parseFloat(String(s).replace(/[^0-9.\-]/g,''));
  return isNaN(n)?null:n;
}
function parseCSV(text) {
  // RFC4180 completo — soporta \n dentro de campos entre comillas (multiline)
  // Fix: el parser anterior usaba text.split('\n') que rompía campos con saltos de línea internos
  const input = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  function tokenize(str) {
    const records=[]; let pos=0; let record=[];
    while(pos<str.length){
      if(str[pos]==='"'){
        pos++; let cell='';
        while(pos<str.length){
          if(str[pos]==='"'){ if(str[pos+1]==='"'){cell+='"';pos+=2;} else{pos++;break;} }
          else{ cell+=str[pos++]; }
        }
        record.push(cell.trim());
      } else {
        let cell='';
        while(pos<str.length && str[pos]!==',' && str[pos]!=='\n') cell+=str[pos++];
        record.push(cell.trim());
      }
      if(pos<str.length && str[pos]===',') pos++;
      else if(pos<str.length && str[pos]==='\n'){
        pos++; if(record.some(v=>v!=='')) records.push(record); record=[];
      }
    }
    if(record.some(v=>v!=='')) records.push(record);
    return records;
  }
  const all=tokenize(input);
  if(all.length<2) return [];
  const headers=all[0].map(h=>h.replace(/^\uFEFF/,'').trim());
  return all.slice(1).map(vals=>{
    const obj={}; headers.forEach((h,i)=>obj[h]=(vals[i]||'').trim()); return obj;
  }).filter(r=>Object.values(r).some(v=>v));
}

function escStr(v) {
  if (v===null||v===undefined) return 'NULL';
  return `'${String(v).replace(/'/g,"''")}'`;
}
function escVal(v) {
  if (v===null||v===undefined) return 'NULL';
  if (typeof v==='number') return String(v);
  return escStr(v);
}

function rowsToUpsertSQL(tabla, rows, upsertKey) {
  if (!rows.length) return '';

  // AGRUPAR/DEDUPLICAR por clave compuesta
  // Para egresos_agrupados_concepto: sumar total_egresos y nro_transacciones
  // Para el resto: quedarse con la última ocurrencia
  const seen = new Map();
  for (const row of rows) {
    const key = upsertKey.map(k => String(row[k]??'')).join('||');
    if (seen.has(key) && tabla === 'egresos_agrupados_concepto') {
      const prev = seen.get(key);
      prev.total_egresos = (parseFloat(prev.total_egresos)||0) + (parseFloat(row.total_egresos)||0);
      prev.nro_transacciones = (parseInt(prev.nro_transacciones)||0) + 1;
    } else {
      seen.set(key, {...row});
    }
  }
  const deduped = [...seen.values()];

  const cols = Object.keys(deduped[0]);
  const conflictCols = upsertKey.join(', ');
  const updateSet = cols
    .filter(c => !upsertKey.includes(c))
    .map(c => `${c} = EXCLUDED.${c}`)
    .join(',\n      ') + ',\n      _sync_fecha = NOW()';

  // Generar en lotes de 200 filas
  const sqls = [];
  for (let i=0; i<deduped.length; i+=200) {
    const batch = deduped.slice(i, i+200);
    const valueRows = batch.map(r =>
      '(' + cols.map(c => escVal(r[c])).join(', ') + ')'
    ).join(',\n  ');
    sqls.push(
`INSERT INTO crisolweb.${tabla} (${cols.join(', ')})
VALUES
  ${valueRows}
ON CONFLICT (${conflictCols}) DO UPDATE SET
      ${updateSet};`
    );
  }
  return sqls.join('\n\n');
}

// ── DESCARGA CSV ──────────────────────────────────────────────
async function descargarCSV(page, context, reporte, fi, ff) {
  let csvResolve, csvReject;
  const csvPromise = new Promise((res,rej)=>{csvResolve=res;csvReject=rej;});
  const timer = setTimeout(()=>csvReject(new Error('timeout 600s')),600000);

  await context.route('**/*OpType=Export*Format=CSV*', async route=>{
    const resp=await route.fetch(); const body=await resp.text();
    clearTimeout(timer); csvResolve(body);
    await route.fulfill({response:resp,body});
  });

  await page.goto(reporte.url,{waitUntil:'networkidle',timeout:30000});
  await page.waitForTimeout(2000);
  await page.evaluate(id=>{
    const el=document.getElementById(id);
    let p=el;while(p){if(p.style)p.style.display='';p=p.parentElement;}el.click();
  }, reporte.menuId);

  let frame=null;
  for(let i=0;i<15;i++){
    for(const f of page.frames()){if(f.url().includes('ReportViewer')){frame=f;break;}}
    if(frame) break; await page.waitForTimeout(1000);
  }
  if(!frame){await context.unroute('**/*OpType=Export*Format=CSV*');throw new Error('no ReportViewer frame');}
  await page.waitForTimeout(3000);
  for(let i=0;i<20;i++){
    const ok=await frame.evaluate(()=>!!document.getElementById('ReportViewer1_ctl05')).catch(()=>false);
    if(ok) break; await page.waitForTimeout(1000);
  }

  if(reporte.dates && fi && ff){
    await frame.evaluate(({fi,ff})=>{
      const inputs=[...document.querySelectorAll('input[id*="txtValue"]')];
      if(inputs.length>=2){
        [inputs[0].value,inputs[1].value]=[fi,ff];
        inputs.forEach(i=>{i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('blur',{bubbles:true}));});
      }
    },{fi,ff});
    await frame.evaluate(()=>{document.getElementById('ReportViewer1_ctl04_ctl00')?.click();});
    for(let i=0;i<30;i++){
      const loading=await frame.evaluate(()=>{const w=document.getElementById('ReportViewer1_AsyncWait');return w&&w.style.display!=='none';}).catch(()=>false);
      if(!loading) break; await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2000);
  }

  await frame.evaluate(()=>{document.getElementById('ReportViewer1_ctl05_ctl04_ctl00_ButtonLink')?.click();});
  await frame.waitForTimeout(500);
  await frame.evaluate(()=>{
    const link=[...document.querySelectorAll('a')].find(a=>(a.getAttribute('onclick')||'').includes("exportReport('CSV')"));
    if(link) link.click();
  });
  const csv=await csvPromise;
  await context.unroute('**/*OpType=Export*Format=CSV*');
  return csv;
}

// ── MAIN ──────────────────────────────────────────────────────
console.log(`🚀 Generando SQL histórico para: ${reportesACorrer.map(r=>r.tabla).join(', ')}`);

const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();

await page.goto('https://crisolweb.net/Seguridad/Login',{waitUntil:'networkidle'});
await page.fill('input[type="text"]',CW_USER);
await page.fill('input[type="password"]',CW_PASS);
await page.click('button[type="submit"], input[type="submit"]');
await page.waitForTimeout(3000);
if(page.url().includes('Login')){console.log('❌ Login fallido');process.exit(1);}
console.log('✅ Login OK\n');

const archivosGenerados=[];

for(const reporte of reportesACorrer){
  const sqlFile=path.join(OUT_DIR, `${reporte.tabla}.sql`);
  const fd=fs.openSync(sqlFile,'w');
  fs.writeSync(fd, `-- UPSERT histórico: crisolweb.${reporte.tabla}\n-- Generado: ${new Date().toISOString()}\n-- Ejecutar: docker exec -i 2f78aec4645a psql -U probolsas_user -d probolsas_db < ${reporte.tabla}.sql\n\n`);

  console.log(`📋 ${reporte.tabla}:`);
  let totalFilas=0;

  const tramos = reporte.dates ? TRAMOS : [{ nombre:'snapshot', fi:null, ff:null }];

  for(const tramo of tramos){
    process.stdout.write(`  ${tramo.nombre}: `);
    try{
      const csv=await descargarCSV(page, context, reporte, tramo.fi, tramo.ff);
      const rawRows=parseCSV(csv);
      if(!rawRows.length){console.log('0 filas');continue;}

      const mapFn=MAPEOS[reporte.tabla];
      const rows=rawRows.map(mapFn).filter(r=>{
        if (!r) return false;
        return reporte.upsertKey.every(k=>r[k]!=null&&r[k]!=='');
      });

      const sql=rowsToUpsertSQL(reporte.tabla, rows, reporte.upsertKey);
      fs.writeSync(fd, `-- ${tramo.nombre}: ${rows.length} filas\n${sql}\n\n`);
      totalFilas+=rows.length;
      console.log(`✅ ${rawRows.length} CSV → ${rows.length} filas SQL`);
      await new Promise(r=>setTimeout(r,2000));
    }catch(e){
      console.log(`❌ ${e.message.substring(0,60)}`);
      // Reintentar login si el browser se cerró
      try{
        await page.goto('https://crisolweb.net/',{waitUntil:'networkidle',timeout:15000});
        if(page.url().includes('Login')){
          await page.fill('input[type="text"]',CW_USER);
          await page.fill('input[type="password"]',CW_PASS);
          await page.click('button[type="submit"], input[type="submit"]');
          await page.waitForTimeout(3000);
        }
      }catch(_){}
    }
  }

  fs.closeSync(fd);
  const size=(fs.statSync(sqlFile).size/1024).toFixed(0);
  console.log(`  → Archivo: ${sqlFile} (${size}KB, ${totalFilas} filas)\n`);
  archivosGenerados.push({tabla:reporte.tabla, archivo:sqlFile, filas:totalFilas, size});
}

await browser.close();

const vacios = archivosGenerados.filter(a => a.filas === 0);
if (vacios.length > 0) {
  console.error('\n❌ ERROR — Uno o más archivos SQL están vacíos.');
  vacios.forEach(a => console.error(`  ${a.tabla.padEnd(28)} ${a.archivo}`));
  process.exit(1);
}
console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ ARCHIVOS SQL GENERADOS — listo para ejecutar en VPS');
console.log('══════════════════════════════════════════════════════════');
archivosGenerados.forEach(a=>
  console.log(`  ${a.tabla.padEnd(28)} ${String(a.filas).padStart(6)} filas  ${a.size}KB  → ${a.archivo}`)
);
console.log('\nPara ejecutar cada tabla desde el VPS:');
archivosGenerados.forEach(a=>{
  const base=path.basename(a.archivo);
  console.log(`  docker cp openclaw-openclaw-gateway-1:${a.archivo} /tmp/${base} && docker exec -i 2f78aec4645a psql -U probolsas_user -d probolsas_db < /tmp/${base}`);
});
