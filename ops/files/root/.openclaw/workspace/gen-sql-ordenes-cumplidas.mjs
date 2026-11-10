// gen-sql-ordenes-cumplidas.mjs — genera UPSERT desde el CSV
import fs from 'fs';

const CSV = '/home/node/.openclaw/workspace/inspect_ordenes_cumplidas.csv';
const OUT = '/home/node/.openclaw/workspace/sql_historico/ordenes_cumplidas.sql';

function parseLine(line){
  const v=[];let c='',q=false;
  for(let i=0;i<line.length;i++){const ch=line[i];
    if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}
    else if(ch===','&&!q){v.push(c);c='';}
    else c+=ch;}
  v.push(c);return v;
}
function dmy(s){ // DD/MM/YYYY → YYYY-MM-DD
  if(!s||!s.trim())return null;
  const p=s.trim().split('/');
  if(p.length!==3)return null;
  return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}
function num(s){ if(s===undefined||s===null||s==='')return null; const n=parseFloat(String(s).replace(/,/g,'')); return isNaN(n)?null:n; }
function sq(s){ return s===null||s===undefined ? 'NULL' : `'${String(s).replace(/'/g,"''")}'`; }

const lines = fs.readFileSync(CSV,'utf8').split(/\r?\n/).filter(l=>l.trim());
const head = parseLine(lines[0]).map(h=>h.replace(/^\ufeff/,'').trim());
const idx = {}; head.forEach((h,i)=>idx[h]=i);

const getCumplida = r => r[idx['CantidadCumplida1']] ?? r[idx['antidadCumplida1']];

let rows=0, skipped=0;
const values=[];
for(const line of lines.slice(1)){
  const r=parseLine(line);
  const nro=(r[idx['NroOrdenProduccion']]||'').trim();
  const ref=(r[idx['CodigoProducto']]||r[idx['CodigoPedido']]||r[idx['NombreTrabajo']]||'').trim();
  if(!nro||!ref){skipped++;continue;}
  values.push(`(${sq(nro)}, ${sq(ref)}, ${sq((r[idx['Cliente']]||'').trim()||null)}, ${sq(dmy(r[idx['FechaAprobacion1']]))}, ${sq(dmy(r[idx['UltimoCumplido']]))}, ${num(r[idx['CantidadAprobada']])??'NULL'}, ${num(getCumplida(r))??'NULL'}, NULL, NULL, ${parseInt(r[idx['DiasVencidos1']]||'0')||0}, 'crisolweb', 'backfill_2026')`);
  rows++;
}

const sql = `-- UPSERT backfill: crisolweb.ordenes_cumplidas
-- Generado: ${new Date().toISOString()}
-- Filas: ${rows} | Descartadas (sin nro/ref): ${skipped}
BEGIN;
INSERT INTO crisolweb.ordenes_cumplidas
  (nro_orden, referencia, cliente, fecha_creacion, fecha_cumplimiento, cantidad_pedida, cantidad_cumplida, valor_total, vendedor, dias_vencido, _fuente, _sync_origen)
VALUES
${values.join(',\n')}
ON CONFLICT (nro_orden, referencia) DO UPDATE SET
  cliente = EXCLUDED.cliente,
  fecha_creacion = EXCLUDED.fecha_creacion,
  fecha_cumplimiento = EXCLUDED.fecha_cumplimiento,
  cantidad_pedida = EXCLUDED.cantidad_pedida,
  cantidad_cumplida = EXCLUDED.cantidad_cumplida,
  dias_vencido = EXCLUDED.dias_vencido,
  _sync_fecha = now(),
  _sync_origen = EXCLUDED._sync_origen;
COMMIT;
`;
fs.mkdirSync('/home/node/.openclaw/workspace/sql_historico',{recursive:true});
fs.writeFileSync(OUT, sql);
console.log(`✅ SQL generado: ${rows} filas, ${skipped} descartadas → ${OUT}`);
