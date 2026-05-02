'use strict';
const { Pool } = require('pg');

// DATABASE_URL tiene precedencia; fallback a vars individuales PG_*
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host:     process.env.PG_HOST     || 'postgres_postgres',
      port:     parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'probolsas_db',
      user:     process.env.PG_USER     || 'probolsas_user',
      password: process.env.PG_PASSWORD,
    });

pool.on('error', (err) => {
  console.error('[pg] Error inesperado en cliente idle:', err.message);
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

/**
 * Prueba la conexión a la DB. Útil en el startup del servidor.
 * @returns {Promise<{ ok: boolean, version?: string, error?: string }>}
 */
async function testConnection() {
  try {
    const { rows } = await query('SELECT version()');
    console.log('[pg] Conectado a:', rows[0].version.split(',')[0]);
    return { ok: true, version: rows[0].version };
  } catch (err) {
    console.error('[pg] Error de conexión:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { query, testConnection };
