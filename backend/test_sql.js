const { query } = require('./src/dbClient');

async function test() {
  try {
    const anioNum = 2026;
    const mesNum = 7;
    const sqlFacturas = `
      SELECT 
        consecutivo as nro_factura,
        valor_neto,
        tercero as cliente,
        fecha_creacion as fecha,
        CASE 
          WHEN valor_neto < 0 THEN 'nota_credito'
          WHEN EXISTS (SELECT 1 FROM crisolweb.facturacion_op fo WHERE fo.nro_op = f.consecutivo) THEN 'con_op'
          ELSE 'sin_op'
        END as categoria
      FROM crisolweb.facturas f
      WHERE EXTRACT(YEAR FROM f.fecha_creacion) = $1 AND EXTRACT(MONTH FROM f.fecha_creacion) = $2
        AND COALESCE(f.es_anulada, false) = false
      ORDER BY f.fecha_creacion DESC
    `;
    const res = await query(sqlFacturas, [anioNum, mesNum]);
    console.log('Success facturas:', res.rows.length);
  } catch (err) {
    console.error('Error facturas:', err);
  }
}

test();
