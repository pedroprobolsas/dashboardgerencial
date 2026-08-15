'use strict';
const { Router } = require('express');
const { query } = require('../dbClient');
const asyncHandler = require('../asyncHandler');
const logger = require('../logger');

const router = Router();
const ENDPOINT = '/api/informes';

/**
 * POST /api/informes/consecutivo
 * Obtiene el consecutivo usando la secuencia app_ops.informes_numero_seq e inserta el trazo.
 */
router.post('/consecutivo', asyncHandler(ENDPOINT, async (req, res) => {
  const { responsable, tipo_efecto, periodo_inicio, periodo_fin } = req.body;
  
  // Obtener el siguiente número de la secuencia
  const seqQuery = await query(`SELECT nextval('app_ops.informes_numero_seq') AS next_num`);
  const numero = parseInt(seqQuery.rows[0].next_num);

  // Insertar el registro en app_ops.informes para la traza
  const insertSql = `
    INSERT INTO app_ops.informes 
    (numero, responsable, efecto, fecha_informe, periodo_inicio, periodo_fin, creado_en) 
    VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, NOW())
    RETURNING fecha_informe
  `;
  
  const { rows } = await query(insertSql, [
    numero, 
    responsable || 'Sin nombre', 
    tipo_efecto || 'ambos', 
    periodo_inicio || null, 
    periodo_fin || null
  ]);

  logger.info(ENDPOINT, `Generado informe N° ${numero} para ${responsable} (Período: ${periodo_inicio} a ${periodo_fin})`);

  return res.json({
    ok: true,
    consecutivo: numero,
    fecha: rows[0].fecha_informe
  });
}));

module.exports = router;
