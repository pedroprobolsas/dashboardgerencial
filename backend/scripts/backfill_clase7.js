'use strict';

const { pool, query } = require('../src/dbClient');
const { obtenerBalancePruebaMes } = require('../src/services/siigoBalanceClient');

/**
 * Script idempotente para cargar cuentas de clase 7 (71, 72, 73) en
 * app_ops.saldos_contables_siigo para todos los meses ya sincronizados.
 */
(async () => {
  try {
    const { rows: meses } = await query(`
      SELECT DISTINCT
        EXTRACT(YEAR FROM fecha)::int AS anio,
        EXTRACT(MONTH FROM fecha)::int AS mes,
        to_char(MAX(fecha), 'YYYY-MM-DD') AS fecha_registro
      FROM app_ops.saldos_contables_siigo
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    for (const m of meses) {
      const balance = await obtenerBalancePruebaMes(m.anio, m.mes);
      const clase7 = balance.filter((r) => r.transaccional && r.codigo.startsWith('7'));
      if (clase7.length === 0) {
        console.log(`${m.anio}-${String(m.mes).padStart(2, '0')}: 0 cuentas clase 7`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM app_ops.saldos_contables_siigo
           WHERE clase = 7 AND EXTRACT(YEAR FROM fecha) = $1 AND EXTRACT(MONTH FROM fecha) = $2`,
          [m.anio, m.mes]
        );

        const valores = [];
        const placeholders = clase7.map((r, idx) => {
          const base = idx * 9;
          valores.push(
            m.fecha_registro,
            r.codigo,
            r.nombre,
            7,
            r.saldo_inicial,
            r.debito,
            r.credito,
            r.saldo_final,
            'api_balance'
          );
          return `($${base + 1}::date, $${base + 2}, $${base + 3}, $${base + 4}::smallint, $${base + 5}::numeric, $${base + 6}::numeric, $${base + 7}::numeric, $${base + 8}::numeric, $${base + 9})`;
        });

        await client.query(
          `INSERT INTO app_ops.saldos_contables_siigo (
            fecha, codigo_cuenta, nombre_cuenta, clase,
            saldo_inicial, movimiento_debito, movimiento_credito, saldo_final, fuente_reporte
          ) VALUES ${placeholders.join(',\n')}`,
          valores
        );
        await client.query('COMMIT');
        console.log(`${m.anio}-${String(m.mes).padStart(2, '0')}: insertadas ${clase7.length} cuentas clase 7 (fecha ${m.fecha_registro})`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
