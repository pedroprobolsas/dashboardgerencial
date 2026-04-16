'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

/**
 * Ejecuta una query SQL contra probolsas_db.
 * @param {string} sql     Sentencia SQL con placeholders $1, $2, ...
 * @param {Array}  params  Valores para los placeholders (opcional).
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

module.exports = { query };
