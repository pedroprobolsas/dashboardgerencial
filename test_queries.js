const { query } = require('./backend/src/dbClient');
async function run() {
  const sqlConsumo = `SELECT bodega, SUM(valor_total) as valor FROM crisolweb.movimientos_materiales WHERE fecha >= '2026-08-01' AND fecha < '2026-09-01' AND origen = 'Cumplido Requisicion' GROUP BY bodega ORDER BY valor DESC`;
  const sqlProduccion = `SELECT bodega, SUM(valor_total) as valor FROM crisolweb.movimientos_materiales WHERE fecha >= '2026-08-01' AND fecha < '2026-09-01' AND origen = 'Cumplido Produccion' GROUP BY bodega ORDER BY valor DESC`;
  const sqlCompras = `SELECT SUM(valor_total) as valor FROM crisolweb.movimientos_materiales WHERE fecha >= '2026-08-01' AND fecha < '2026-09-01' AND origen = 'Compra' AND bodega = '00 Materia Prima'`;

  try {
    const resConsumo = await query(sqlConsumo);
    console.log('--- CONSUMO MATERIA PRIMA ---');
    let cTot = 0;
    resConsumo.rows.forEach(r => { console.log(r.bodega, r.valor); cTot += parseFloat(r.valor); });
    console.log('TOTAL:', cTot);

    const resProd = await query(sqlProduccion);
    console.log('\n--- PRODUCCION TERMINADA ---');
    let pTot = 0;
    resProd.rows.forEach(r => { console.log(r.bodega, r.valor); pTot += parseFloat(r.valor); });
    console.log('TOTAL:', pTot);

    const resCom = await query(sqlCompras);
    console.log('\n--- COMPRAS MATERIA PRIMA ---');
    console.log('TOTAL:', resCom.rows[0].valor);
    
    process.exit(0);
  } catch(e) { console.error(e.message); process.exit(1); }
}
run();
