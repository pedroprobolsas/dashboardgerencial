require('dotenv').config();
const { query } = require('./src/dbClient');
async function test() {
  const f = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'crisolweb' AND table_name = 'facturacion_op'");
  console.log("facturacion_op columns:");
  f.rows.forEach(r => console.log(r.column_name));
  const f2 = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'crisolweb' AND table_name = 'facturas'");
  console.log("facturas columns:");
  f2.rows.forEach(r => console.log(r.column_name));
  const f3 = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'crisolweb' AND table_name = 'costo_por_orden'");
  console.log("costo_por_orden columns:");
  f3.rows.forEach(r => console.log(r.column_name));
  process.exit(0);
}
test().catch(console.error);
