require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'crisolweb' 
        AND table_name IN ('cartera_vendedor', 'cartera_por_pagar')
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
