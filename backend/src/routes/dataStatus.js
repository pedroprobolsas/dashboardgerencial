'use strict';

const express = require('express');
const router = express.Router();
const db = require('../dbClient');
const asyncHandler = require('../asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      pipeline_id as id,
      nombre_display as nombre,
      estado,
      ultima_fecha_datos,
      dias_atraso,
      mensaje,
      ultima_verificacion
    FROM app_ops.pipeline_health 
    WHERE activo = true
    ORDER BY 
      CASE 
        WHEN estado = 'rojo' THEN 1
        WHEN estado = 'amarillo' THEN 2
        WHEN estado = 'verde' THEN 3
        ELSE 4
      END,
      nombre_display ASC
  `;
  
  const result = await db.query(query);
  
  let resumen = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  let ultima_verificacin = null;
  
  result.rows.forEach(row => {
    if (resumen[row.estado] !== undefined) {
      resumen[row.estado]++;
    } else {
      resumen.sin_datos++;
    }
    
    if (row.ultima_verificacion) {
      if (!ultima_verificacin || new Date(row.ultima_verificacion) > new Date(ultima_verificacin)) {
        ultima_verificacin = row.ultima_verificacion;
      }
    }
  });

  res.json({
    verificado_en: ultima_verificacin,
    resumen,
    pipelines: result.rows
  });
}));

module.exports = router;
