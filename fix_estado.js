const fs = require('fs');

const file = 'backend/src/routes/movimientosMateriales.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/COALESCE\(f\.es_anulada,\s*false\)\s*=\s*false/g, "(f.estado IS NULL OR UPPER(TRIM(f.estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))");

fs.writeFileSync(file, content);
console.log('Fixed es_anulada to estado in backend sql queries');
