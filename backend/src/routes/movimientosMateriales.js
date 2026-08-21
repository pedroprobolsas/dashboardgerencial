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
