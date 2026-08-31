const fs = require('fs');
const file = 'backend/src/routes/kpis.js';
let content = fs.readFileSync(file, 'utf8');

const strStart = '/**\n * Calcula la diferencia en días hábiles';
const strEnd = '// ── KPI: Flujo de caja ────────────────────────────────────────────────────────';

const startIndex = content.indexOf(strStart);
const endIndex = content.indexOf(strEnd);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + content.substring(endIndex);
  
  // Also remove from the kpis object return
  content = content.replace(/        ventas_meta:[\s\S]*?\.\.\.ventas        \},\n/, '');
  content = content.replace(/        margen_caja:[\s\S]*?\.\.\.margen        \},\n/, '');
  content = content.replace(/        cartera_asesores:[\s\S]*?\.\.\.cartera       \},\n/, '');
  
  // Add import at the top
  content = content.replace("const { query }     = require('../dbClient');", "const { query }     = require('../dbClient');\nconst { diasHabilesEntre } = require('../utils/dateUtils');");
  
  fs.writeFileSync(file, content);
  console.log("Success");
} else {
  console.log("Failed to find boundaries");
}
