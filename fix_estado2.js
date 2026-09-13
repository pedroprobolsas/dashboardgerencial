const fs = require('fs');

const file = 'backend/src/routes/movimientosMateriales.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/COALESCE\(es_anulada,\s*false\)\s*=\s*false/g, "(estado IS NULL OR UPPER(TRIM(estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))");

fs.writeFileSync(file, content);
console.log('Fixed es_anulada to estado globally in backend sql queries');
