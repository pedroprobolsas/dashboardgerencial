const db=require('./backend/src/dbClient');
async function check() {
  const res = await db.query(`SELECT * FROM app_ops.parametros WHERE clave = 'ratio_ajuste_inventario'`);
  if (res.rows.length === 0) {
    console.log("Not found, inserting...");
    await db.query(`
      INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por, motivo)
      VALUES ('ratio_ajuste_inventario', 77.00, '%', 'Ratio aplicable a las Ventas Netas para calcular el CC-101 Propuesto. Revisar trimestralmente.', 'Métricas Financieras', '2026-09-12', 'admin@probolsas.co', 'Valor inicial')
    `);
  }
  console.log("Done");
  process.exit();
}
check();
