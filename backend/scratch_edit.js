const fs = require('fs');
const file = 'backend/src/routes/kpis.js';
let content = fs.readFileSync(file, 'utf8');

// Remove diasHabilesEntre
content = content.replace(/\/\*\*\n \* Calcula la diferencia en días hábiles[\s\S]*?return count;\n}\n/g, '');

// Remove kpiVentasMeta
content = content.replace(/\/\/ ── KPI: Ventas del mes vs meta ──[\s\S]*?async function kpiVentasMeta[\s\S]*?return \{ fuente: 'error'[\s\S]*?\}\n}\n/g, '');

// Remove kpiMargenCaja
content = content.replace(/\/\/ ── KPI: Margen de caja ──[\s\S]*?async function kpiMargenCaja[\s\S]*?return \{ fuente: 'error'[\s\S]*?\}\n}\n/g, '');

// Remove kpiCarteraPorAsesor
content = content.replace(/\/\/ ── KPI: Cartera por Asesor ──[\s\S]*?async function kpiCarteraPorAsesor[\s\S]*?return \{ fuente: 'error'[\s\S]*?\}\n}\n/g, '');

// Remove from Promise.all
content = content.replace(
  'const [ventas, margen, cartera, flujo, cierre, produccion, costo, rotacion, obligaciones, diario, calidad, sobrecostoMateriales] = await Promise.all([',
  'const [flujo, cierre, produccion, costo, rotacion, obligaciones, diario, calidad, sobrecostoMateriales] = await Promise.all(['
);
content = content.replace('      kpiVentasMeta({ mesNum, anio }, metas),\n', '');
content = content.replace('      kpiMargenCaja({ mesNum, anio }, metas),\n', '');
content = content.replace('      kpiCarteraPorAsesor(metas),\n', '');

// Remove from kpis object
content = content.replace(/        ventas_meta:[^\n]*\n/, '');
content = content.replace(/        margen_caja:[^\n]*\n/, '');
content = content.replace(/        cartera_asesores:[^\n]*\n/, '');

// Insert the require for dateUtils at the top (after other requires)
content = content.replace("const { query }     = require('../dbClient');", "const { query }     = require('../dbClient');\nconst { diasHabilesEntre } = require('../utils/dateUtils');");

fs.writeFileSync(file, content);
