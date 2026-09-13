const fs = require('fs');

const file = 'backend/src/routes/movimientosMateriales.js';
let content = fs.readFileSync(file, 'utf8');

const oldKPI = `
    const sqlKPIs = \`
      WITH facturas_mes AS (
        SELECT consecutivo, valor_neto
        FROM crisolweb.facturas
        WHERE fecha >= $1 AND fecha < $2
          AND COALESCE(es_anulada, false) = false
      ),`;

const newKPI = `
    const sqlKPIs = \`
      WITH facturas_mes AS (
        SELECT consecutivo, valor_neto
        FROM crisolweb.facturas
        WHERE fecha_creacion >= $1 AND fecha_creacion < $2
          AND COALESCE(es_anulada, false) = false
      ),`;

if (content.includes(oldKPI)) {
  content = content.replace(oldKPI, newKPI);
  fs.writeFileSync(file, content);
  console.log('Fixed sqlKPIs in /cierre-costos using fecha_creacion');
} else {
  // Maybe it already uses EXTRACT or something? Wait, no, it's probably using fecha.
  // I will just use regex to replace all 'FROM crisolweb.facturas \n WHERE fecha >=' to 'fecha_creacion >='
  let newContent = content.replace(/FROM crisolweb\.facturas\s+WHERE fecha >=\s+\$1\s+AND\s+fecha\s+<\s+\$2/g, 'FROM crisolweb.facturas\n        WHERE fecha_creacion >= $1 AND fecha_creacion < $2');
  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log('Fixed using regex');
  } else {
    console.log('Could not find it');
  }
}
