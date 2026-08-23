'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { query, testConnection } = require('../src/dbClient');

async function seed() {
  const pg = await testConnection();
  if (!pg.ok) {
    console.error('? No se pudo conectar a PostgreSQL.');
    process.exit(1);
  }

  try {
    console.log('Insertando parámetros...');
    await query( + "" + INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por) SELECT 'atraso_dias_tolerancia', 2, 'días', 'Días de atraso', 'Producción', CURRENT_DATE, 'sistema@probolsas.com' WHERE NOT EXISTS (SELECT 1 FROM app_ops.parametros WHERE clave = 'atraso_dias_tolerancia') + "" + );
    await query( + "" + INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por) SELECT 'atraso_dias_critico', 10, 'días', 'Días para crítica', 'Producción', CURRENT_DATE, 'sistema@probolsas.com' WHERE NOT EXISTS (SELECT 1 FROM app_ops.parametros WHERE clave = 'atraso_dias_critico') + "" + );
    console.log('? Parámetros insertados.');
  } catch (err) {
    console.error('? Error:', err.message);
  } finally {
    process.exit(0);
  }
}
seed();
