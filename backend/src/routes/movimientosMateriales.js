const express = require('express');
const { query } = require('../dbClient');
const router = express.Router();

/**
 * GET /api/movimientos_materiales
 */
router.get('/', async (req, res) => {
  try {
    const { anio, mes, bodega, origen, page = '1', limit = '50' } = req.query;
    
    if (!anio || !mes) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros anio y mes' });
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const offsetNum = (pageNum - 1) * limitNum;

    // Calcular rango de fechas
    const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
    let proximoMes = parseInt(mes, 10) + 1;
    let proximoAnio = parseInt(anio, 10);
    if (proximoMes > 12) {
      proximoMes = 1;
      proximoAnio += 1;
    }
    const primerDiaSiguiente = `${proximoAnio}-${String(proximoMes).padStart(2, '0')}-01`;

    let whereSql = `WHERE fecha >= $1 AND fecha < $2`;
    let params = [primerDia, primerDiaSiguiente];
    let paramIndex = 3;

    if (bodega && bodega !== 'Todas') {
      whereSql += ` AND bodega = $${paramIndex++}`;
      params.push(bodega);
    }
    
    if (origen && origen !== 'Todos') {
      whereSql += ` AND origen = $${paramIndex++}`;
      params.push(origen);
    }

    const kpiQuery = `
      SELECT 
        COUNT(*) as total_rows,
        COALESCE(SUM(entradas), 0) as total_entradas,
        COALESCE(SUM(salida), 0) as total_salidas,
        COALESCE(SUM(valor_total), 0) as total_valor
      FROM crisolweb.movimientos_materiales
      ${whereSql}
    `;

    const dataQuery = `
      SELECT 
        id, consecutivo, fecha, fecha_contable, material, tipo_movimiento, 
        concepto, entradas, salida, precio, valor_total, lote, origen, 
        documento, tercero, bodega
      FROM crisolweb.movimientos_materiales
      ${whereSql}
      ORDER BY fecha DESC, id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const dataParams = [...params, limitNum, offsetNum];

    const [kpiRes, dataRes] = await Promise.all([
      query(kpiQuery, params),
      query(dataQuery, dataParams)
    ]);

    const totalRows = parseInt(kpiRes.rows[0].total_rows, 10);
    
    res.json({
      ok: true,
      data: dataRes.rows,
      total: totalRows,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalRows / limitNum),
      kpis: {
        movimientos: totalRows,
        entradas: parseFloat(kpiRes.rows[0].total_entradas),
        salidas: parseFloat(kpiRes.rows[0].total_salidas),
        valor_movimientos: parseFloat(kpiRes.rows[0].total_valor)
      }
    });

  } catch (err) {
    console.error('GET /api/movimientos_materiales error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/movimientos_materiales/cierre-costos
 */
router.get('/cierre-costos', async (req, res) => {
  try {
    const { anio, mes } = req.query;
    
    if (!anio || !mes) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros anio y mes' });
    }

    const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
    let proximoMes = parseInt(mes, 10) + 1;
    let proximoAnio = parseInt(anio, 10);
    if (proximoMes > 12) {
      proximoMes = 1;
      proximoAnio += 1;
    }
    const primerDiaSiguiente = `${proximoAnio}-${String(proximoMes).padStart(2, '0')}-01`;

    const sqlConsumo = `
      WITH crudos AS (
        SELECT valor_total, bodega
        FROM crisolweb.movimientos_materiales
        WHERE fecha >= $1 AND fecha < $2
          AND origen = 'Cumplido Requisicion'
          AND concepto = 'CONSUMO MATERIA PRIMA'
      ),
      agrupados AS (
        SELECT bodega, SUM(valor_total) as valor_bodega
        FROM crudos
        GROUP BY bodega
      ),
      totales AS (
        SELECT 
          (SELECT SUM(valor_total) FROM crudos) as total_directo,
          (SELECT SUM(valor_bodega) FROM agrupados) as total_bodegas
      )
      SELECT 
        a.bodega, 
        a.valor_bodega as valor,
        t.total_directo as valor_total_global,
        COALESCE(t.total_directo, 0) - COALESCE(t.total_bodegas, 0) as diferencia_cuadre
      FROM agrupados a CROSS JOIN totales t
      ORDER BY a.valor_bodega DESC
    `;

    const sqlProduccion = `
      WITH crudos AS (
        SELECT valor_total, bodega
        FROM crisolweb.movimientos_materiales
        WHERE fecha >= $1 AND fecha < $2
          AND origen = 'Cumplido Produccion'
      ),
      agrupados AS (
        SELECT bodega, SUM(valor_total) as valor_bodega
        FROM crudos
        GROUP BY bodega
      ),
      totales AS (
        SELECT 
          (SELECT SUM(valor_total) FROM crudos) as total_directo,
          (SELECT SUM(valor_bodega) FROM agrupados) as total_bodegas
      )
      SELECT 
        a.bodega, 
        a.valor_bodega as valor,
        t.total_directo as valor_total_global,
        COALESCE(t.total_directo, 0) - COALESCE(t.total_bodegas, 0) as diferencia_cuadre
      FROM agrupados a CROSS JOIN totales t
      ORDER BY a.valor_bodega DESC
    `;

    const sqlCompras = `
      SELECT SUM(valor_total) as valor
      FROM crisolweb.movimientos_materiales
      WHERE fecha >= $1 AND fecha < $2
        AND origen = 'Compra'
        AND bodega = '00 Materia Prima'
    `;

    const params = [primerDia, primerDiaSiguiente];
    const [resConsumo, resProduccion, resCompras] = await Promise.all([
      query(sqlConsumo, params),
      query(sqlProduccion, params),
      query(sqlCompras, params)
    ]);

    // Extraer totales globales nativos de Postgres (vienen como string por ser NUMERIC, se envían así para evitar pérdida en JS)
    const consumoTotal = resConsumo.rows.length > 0 ? resConsumo.rows[0].valor_total_global : "0";
    const consumoDif = resConsumo.rows.length > 0 ? resConsumo.rows[0].diferencia_cuadre : "0";
    const consumoPorBodega = resConsumo.rows.map(r => ({
      bodega: r.bodega,
      valor: r.valor // string
    }));

    const produccionTotal = resProduccion.rows.length > 0 ? resProduccion.rows[0].valor_total_global : "0";
    const produccionDif = resProduccion.rows.length > 0 ? resProduccion.rows[0].diferencia_cuadre : "0";
    const produccionPorBodega = resProduccion.rows.map(r => ({
      bodega: r.bodega,
      valor: r.valor // string
    }));

    const comprasTotal = resCompras.rows[0]?.valor || "0";
    
    res.json({
      ok: true,
      consumoMateriaPrima: {
        total: consumoTotal,
        porBodega: consumoPorBodega
      },
      produccionTerminada: {
        total: produccionTotal,
        porBodega: produccionPorBodega
      },
      comprasMateriaPrima: {
        total: comprasTotal,
        bodega: '00 Materia Prima'
      },
      controles: {
        diferenciaProduccion: produccionDif,
        diferenciaConsumo: consumoDif
      }
    });

  } catch (err) {
    console.error('GET /api/movimientos_materiales/cierre-costos error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/movimientos_materiales/filtros
 */
router.get('/filtros', async (req, res) => {
  try {
    const [aniosRes, bodegasRes, origenesRes, tiposRes] = await Promise.all([
      query(`SELECT DISTINCT EXTRACT(YEAR FROM fecha) as anio FROM crisolweb.movimientos_materiales ORDER BY anio DESC`),
      query(`SELECT DISTINCT bodega FROM crisolweb.movimientos_materiales WHERE bodega IS NOT NULL ORDER BY bodega`),
      query(`SELECT DISTINCT origen FROM crisolweb.movimientos_materiales WHERE origen IS NOT NULL ORDER BY origen`),
      query(`SELECT DISTINCT tipo_movimiento FROM crisolweb.movimientos_materiales WHERE tipo_movimiento IS NOT NULL ORDER BY tipo_movimiento`)
    ]);

    res.json({
      ok: true,
      anios: aniosRes.rows.map(r => parseInt(r.anio, 10)),
      bodegas: bodegasRes.rows.map(r => r.bodega),
      origenes: origenesRes.rows.map(r => r.origen),
      tipos: tiposRes.rows.map(r => r.tipo_movimiento)
    });
  } catch (err) {
    console.error('GET /api/movimientos_materiales/filtros error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
