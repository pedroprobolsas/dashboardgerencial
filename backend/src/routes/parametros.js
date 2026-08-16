'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const logger        = require('../logger');

const router = Router();
const ENDPOINT = '/api/parametros';

// GET /api/parametros
// Returns the currently active parameters, or the ones active at a specific ?fecha=YYYY-MM-DD
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha } = req.query;
  
  let sql;
  let params = [];
  
  if (fecha) {
    sql = `
      SELECT id, clave, valor, unidad, descripcion, categoria, vigente_desde, vigente_hasta, modificado_por, modificado_en
      FROM app_ops.parametros
      WHERE vigente_desde <= $1::date 
        AND (vigente_hasta IS NULL OR vigente_hasta > $1::date)
    `;
    params.push(fecha);
  } else {
    sql = `
      SELECT id, clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por, modificado_en
      FROM app_ops.parametros
      WHERE vigente_hasta IS NULL
    `;
  }
  
  const { rows } = await query(sql, params);
  
  const data = rows.reduce((acc, row) => {
    acc[row.clave] = {
      valor: parseFloat(row.valor),
      unidad: row.unidad,
      descripcion: row.descripcion,
      categoria: row.categoria,
      vigente_desde: row.vigente_desde,
      modificado_por: row.modificado_por
    };
    return acc;
  }, {});
  
  return res.json({ ok: true, parametros: data, raw: rows });
}));

// GET /api/parametros/historico
// Returns all parameters including closed ones
router.get('/historico', asyncHandler(ENDPOINT + '/historico', async (req, res) => {
  const sql = `
    SELECT id, clave, valor, unidad, descripcion, categoria, vigente_desde, vigente_hasta, modificado_por, modificado_en
    FROM app_ops.parametros
    ORDER BY categoria, clave, vigente_desde DESC
  `;
  const { rows } = await query(sql);
  
  return res.json({ ok: true, historico: rows });
}));

// POST /api/parametros
// Update a parameter by closing the current one and inserting a new one
router.post('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { clave, valor, modificado_por } = req.body;
  
  if (!clave || valor === undefined || valor === null || !modificado_por) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos (clave, valor, modificado_por)' });
  }
  
  // 1. Get the current active record
  const currentSql = `SELECT * FROM app_ops.parametros WHERE clave = $1 AND vigente_hasta IS NULL`;
  const { rows } = await query(currentSql, [clave]);
  
  if (rows.length === 0) {
    return res.status(404).json({ ok: false, error: 'Parámetro no encontrado o sin versión vigente' });
  }
  
  const current = rows[0];
  
  if (parseFloat(current.valor) === parseFloat(valor)) {
    return res.json({ ok: true, message: 'El valor es igual al actual' });
  }
  
  // We need a transaction to safely close the old one and open the new one
  const client = await require('../dbClient').pool.connect();
  try {
    await client.query('BEGIN');
    
    // Close current
    await client.query(
      `UPDATE app_ops.parametros SET vigente_hasta = CURRENT_DATE WHERE id = $1`,
      [current.id]
    );
    
    // Insert new
    await client.query(
      `INSERT INTO app_ops.parametros (clave, valor, unidad, descripcion, categoria, vigente_desde, modificado_por)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6)`,
      [current.clave, valor, current.unidad, current.descripcion, current.categoria, modificado_por]
    );
    
    await client.query('COMMIT');
    logger.info(ENDPOINT, `Parámetro actualizado: ${clave} -> ${valor}`, { modificado_por });
    return res.json({ ok: true, message: 'Parámetro actualizado exitosamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
