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
  const { responsable, tipo_efecto, periodo_inicio, periodo_fin, tipo_informe } = req.body;
  
  // Obtener el siguiente número de la secuencia
  const seqQuery = await query(`SELECT nextval('app_ops.informes_numero_seq') AS next_num`);
  const numero = parseInt(seqQuery.rows[0].next_num);

  // Insertar el registro en app_ops.informes para la traza
  // Asumimos que podemos agregar tipo_informe si no estaba (o reutilizar efecto/tipo_efecto)
  // El usuario dice: "registrado en app_ops.informes con el tipo (responsable / materiales / OP)". 
  // Voy a inyectarlo en 'efecto' si el esquema no tiene tipo_informe. Wait, "con el tipo (responsable / materiales / OP)".
  // Si la tabla app_ops.informes tiene columnas: numero (PK), responsable, efecto, fecha_informe, periodo_inicio, periodo_fin, creado_en.
  // Puedo concatenar tipo_informe + efecto, o guardarlo en "efecto". Voy a pasarlo en el campo efecto o si me lo envían en tipo_efecto.
  const insertSql = `
    INSERT INTO app_ops.informes 
    (numero, responsable, efecto, fecha_informe, periodo_inicio, periodo_fin, creado_en) 
    VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, NOW())
    RETURNING fecha_informe
  `;
  
  const { rows } = await query(insertSql, [
    numero, 
    req.user.nombre || req.user.email, 
    (tipo_informe ? `[${tipo_informe}] ` : '') + (tipo_efecto || 'ambos'), 
    periodo_inicio || null, 
    periodo_fin || null
  ]);

  // Formatear DDMMAAAA-N
  const dateObj = new Date();
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  const numeroFormateado = `${d}${m}${y}-${numero}`;

  logger.info(ENDPOINT, `Generado informe N° ${numeroFormateado} para ${responsable} (Período: ${periodo_inicio} a ${periodo_fin})`);

  return res.json({
    ok: true,
    consecutivo: numeroFormateado,
    fecha: rows[0].fecha_informe
  });
}));

module.exports = router;
