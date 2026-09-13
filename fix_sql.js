const fs = require('fs');

const file = 'backend/src/routes/movimientosMateriales.js';
let content = fs.readFileSync(file, 'utf8');

const oldBlock = `
    const primerDia = \`\${anio}-\${String(mes).padStart(2, '0')}-01\`;
    let proximoMes = parseInt(mes, 10) + 1;
    let proximoAnio = parseInt(anio, 10);
    if (proximoMes > 12) {
      proximoMes = 1;
      proximoAnio += 1;
    }
    const primerDiaSiguiente = \`\${proximoAnio}-\${String(proximoMes).padStart(2, '0')}-01\`;
    
    // Facturas del mes categorizadas
    const sqlFacturas = \`
      SELECT 
        consecutivo as nro_factura,
        valor_neto,
        tercero as cliente,
        fecha,
        CASE 
          WHEN valor_neto < 0 THEN 'nota_credito'
          WHEN EXISTS (SELECT 1 FROM crisolweb.facturacion_op fo WHERE fo.nro_op = f.consecutivo) THEN 'con_op'
          ELSE 'sin_op'
        END as categoria
      FROM crisolweb.facturas f
      WHERE f.fecha >= $1 AND f.fecha < $2
        AND COALESCE(f.es_anulada, false) = false
      ORDER BY fecha DESC
    \`;
    
    // OPs facturadas del mes
    const sqlOps = \`
      SELECT DISTINCT
        fo.referencia as nro_op,
        cpo.cliente,
        cpo.costo_material,
        cpo.costo_mo,
        cpo.costo_cif,
        cpo.costo_ejecutado_total,
        cpo.valor_cumplido,
        cpo.estado
      FROM crisolweb.facturas f
      JOIN crisolweb.facturacion_op fo ON f.consecutivo = fo.nro_op
      JOIN crisolweb.costo_por_orden cpo ON fo.referencia = cpo.nro_op
      WHERE f.fecha >= $1 AND f.fecha < $2
        AND COALESCE(f.es_anulada, false) = false
      ORDER BY fo.referencia DESC
    \`;

    // Facturas huérfanas top 10 (sin_op, valor_neto > 0)
    const sqlHuerfanas = \`
      SELECT consecutivo as nro_factura, tercero as cliente, valor_neto
      FROM crisolweb.facturas f
      WHERE f.fecha >= $1 AND f.fecha < $2
        AND valor_neto > 0
        AND COALESCE(f.es_anulada, false) = false
        AND NOT EXISTS (SELECT 1 FROM crisolweb.facturacion_op fo WHERE fo.nro_op = f.consecutivo)
      ORDER BY valor_neto DESC
      LIMIT 10
    \`;

    const params = [primerDia, primerDiaSiguiente];
`;

const newBlock = `
    const anioNum = parseInt(anio, 10);
    const mesNum = parseInt(mes, 10);
    
    // Facturas del mes categorizadas
    const sqlFacturas = \`
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
    \`;
    
    // OPs facturadas del mes
    const sqlOps = \`
      SELECT DISTINCT
        fo.referencia as nro_op,
        cpo.cliente,
        cpo.costo_material,
        cpo.costo_mo,
        cpo.costo_cif,
        cpo.costo_ejecutado_total,
        cpo.valor_cumplido,
        cpo.estado
      FROM crisolweb.facturas f
      JOIN crisolweb.facturacion_op fo ON f.consecutivo = fo.nro_op
      JOIN crisolweb.costo_por_orden cpo ON fo.referencia = cpo.nro_op
      WHERE EXTRACT(YEAR FROM f.fecha_creacion) = $1 AND EXTRACT(MONTH FROM f.fecha_creacion) = $2
        AND COALESCE(f.es_anulada, false) = false
      ORDER BY fo.referencia DESC
    \`;

    // Facturas huérfanas top 10 (sin_op, valor_neto > 0)
    const sqlHuerfanas = \`
      SELECT consecutivo as nro_factura, tercero as cliente, valor_neto
      FROM crisolweb.facturas f
      WHERE EXTRACT(YEAR FROM f.fecha_creacion) = $1 AND EXTRACT(MONTH FROM f.fecha_creacion) = $2
        AND valor_neto > 0
        AND COALESCE(f.es_anulada, false) = false
        AND NOT EXISTS (SELECT 1 FROM crisolweb.facturacion_op fo WHERE fo.nro_op = f.consecutivo)
      ORDER BY valor_neto DESC
      LIMIT 10
    \`;

    const params = [anioNum, mesNum];
`;

content = content.replace(oldBlock.trim(), newBlock.trim());
fs.writeFileSync(file, content);
console.log('Fixed backend sql query');
