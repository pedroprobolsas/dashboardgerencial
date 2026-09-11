require('dotenv').config();
const { query } = require('./src/dbClient');
async function test() {
  const sql = `SELECT fecha, clase, valor, tipo 
               FROM app_ops.v_saldos_mensuales_por_clase 
               WHERE fecha >= $1::date AND fecha < ($1::date + INTERVAL '1 month') 
               ORDER BY fecha ASC, clase ASC`;
  const { rows } = await query(sql, ['2026-03-01']);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
test().catch(console.error);
