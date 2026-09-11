require('dotenv').config();
const { query } = require('./src/dbClient');
const fs = require('fs');

async function test() {
  const f = await query("SELECT * FROM crisolweb.facturacion_op LIMIT 1");
  const f2 = await query("SELECT * FROM crisolweb.facturas LIMIT 1");
  const f3 = await query("SELECT * FROM crisolweb.costo_por_orden LIMIT 1");
  fs.writeFileSync('../schema_dump.json', JSON.stringify({
    facturacion_op: f.rows[0],
    facturas: f2.rows[0],
    costo_por_orden: f3.rows[0]
  }, null, 2));
  process.exit(0);
}
test().catch(console.error);
