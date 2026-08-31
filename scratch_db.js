require('dotenv').config({path: './backend/.env'});
const { query } = require('./backend/src/dbClient');
async function run() {
  try {
    const res = await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('cartera_vendedor', 'cartera_por_pagar')");
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
