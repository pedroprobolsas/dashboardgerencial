'use strict';
const { Router } = require('express');
const { query } = require('../dbClient');
const asyncHandler = require('../asyncHandler');
const logger = require('../logger');

const router = Router();
const ENDPOINT = '/api/informes';

/**
 * POST /api/informes/consecutivo
 * Obtiene o crea un nuevo consecutivo para los informes.
 */
router.post('/consecutivo', asyncHandler(ENDPOINT, async (req, res) => {
  const { responsable, tipo_efecto } = req.body;
  
  // Create table if it doesn't exist
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS crisolweb.informes_consecutivo (
      id SERIAL PRIMARY KEY,
      consecutivo INT NOT NULL,
      fecha TIMESTAMP NOT NULL DEFAULT NOW(),
      responsable VARCHAR(255),
      tipo_efecto VARCHAR(50)
    );
  `;
  await query(createTableSql);

  // Get max consecutivo
  const maxQuery = await query(`SELECT MAX(consecutivo) as max_val FROM crisolweb.informes_consecutivo`);
  let nextConsecutivo = 10001; // Empieza en 10001
  
  if (maxQuery.rows[0].max_val) {
    nextConsecutivo = parseInt(maxQuery.rows[0].max_val) + 1;
  }

  // Insert the new consecutivo
  const insertSql = `
    INSERT INTO crisolweb.informes_consecutivo (consecutivo, responsable, tipo_efecto) 
    VALUES ($1, $2, $3) RETURNING id, consecutivo, fecha
  `;
  const { rows } = await query(insertSql, [nextConsecutivo, responsable || null, tipo_efecto || null]);

  logger.info(ENDPOINT, `Generado consecutivo ${nextConsecutivo} para ${responsable}`);

  return res.json({
    ok: true,
    consecutivo: rows[0].consecutivo,
    fecha: rows[0].fecha
  });
}));

module.exports = router;
