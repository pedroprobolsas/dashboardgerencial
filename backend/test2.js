const { query } = require('./src/dbClient');
async function test() {
  try {
    const sql = `
    SELECT
      d.nro_op,
      d.referencia,
      d.item AS material,
      o.cantidad_cotizada AS op_cantidad_cotizada,
      o.cantidad_ejecutada AS op_cantidad_ejecutada,
      
      ROUND(d.cant_cotizada, 4) AS cant_cotizada,
      ROUND(d.cant_ejecutada, 4) AS cant_ejecutada,
      ROUND(d.valor_cotizado, 2) AS valor_cotizado,
      ROUND(d.valor_ejecutado, 2) AS valor_ejecutado,
      ROUND(d.cumplimiento, 2) AS cumplimiento,
      
      CASE 
        WHEN d.cant_cotizada > 0 THEN ROUND(((d.cant_ejecutada - d.cant_cotizada) / d.cant_cotizada) * 100, 2) 
        ELSE NULL 
      END AS diferencia_cant_pct,
      
      ROUND(d.valor_cotizado / NULLIF(d.cant_cotizada, 0), 2) AS precio_cotizado,
      ROUND(d.valor_ejecutado / NULLIF(d.cant_ejecutada, 0), 2) AS precio_real,
      o.fecha
      
    FROM crisolweb.costo_por_orden_detalle d
    JOIN crisolweb.costo_por_orden o ON d.nro_op = o.nro_op AND d.referencia = o.referencia
    WHERE o.fecha >= $1::date
      AND o.fecha <= $2::date
      AND d.categoria = 'material'
    ORDER BY d.nro_op DESC
    `;
    console.log(sql);
  } catch (e) {
    console.log('error', e);
  }
}
test();
