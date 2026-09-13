const { query } = require('./backend/src/dbClient');
async function test() {
  const f = await query('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['crisolweb', 'facturacion_op']);
  console.log("facturacion_op:", f.rows);
  const f2 = await query('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['crisolweb', 'facturas']);
  console.log("facturas:", f2.rows);
  const f3 = await query('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['crisolweb', 'costo_por_orden']);
  console.log("costo_por_orden:", f3.rows);
  process.exit(0);
}
test();
