const fs = require('fs');

const file = 'backend/src/routes/movimientosMateriales.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the buggy query
const oldBuggy = `      WITH facturas_mes AS (
        SELECT f.consecutivo, f.valor_neto
        FROM crisolweb.facturas f
        WHERE f.fecha >= $1 AND f.fecha < $2
          AND f.anulada = false
      ),`;

const newBuggy = `      WITH facturas_mes AS (
        SELECT f.consecutivo, f.valor_neto
        FROM crisolweb.facturas f
        WHERE f.fecha_creacion >= $1 AND f.fecha_creacion < $2
          AND (f.estado IS NULL OR UPPER(TRIM(f.estado)) NOT IN ('ANULADO', 'SIN CONFIRMAR', 'ANULADA'))
      ),`;

content = content.replace(oldBuggy, newBuggy);

fs.writeFileSync(file, content);
console.log('Fixed sqlVentasYCosto in cierre-costos');
