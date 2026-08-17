'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const logger        = require('../logger');

const router   = Router();
const ENDPOINT = '/api/tarjetas_dashboard';

/**
 * GET /api/tarjetas_dashboard
 * Devuelve todas las tarjetas con su visibilidad y orden.
 */
router.get('/', asyncHandler(ENDPOINT, async (_req, res) => {
  const { rows } = await query(
    `SELECT clave, nombre, visible, orden
     FROM app_ops.tarjetas_dashboard
     ORDER BY orden ASC, clave ASC`
  );
  return res.json({ ok: true, tarjetas: rows });
}));

/**
 * PUT /api/tarjetas_dashboard
 * Actualiza visibilidad y orden de todas las tarjetas.
 * Body: { tarjetas: [{ clave, visible, orden }] }
 */
router.put('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { tarjetas } = req.body;
  if (!Array.isArray(tarjetas) || tarjetas.length === 0) {
    return res.status(400).json({ ok: false, error: 'Se requiere un array de tarjetas' });
  }

  const usuario = req.user?.nombre || 'sistema';

  for (const t of tarjetas) {
    if (!t.clave) continue;
    await query(
      `UPDATE app_ops.tarjetas_dashboard
       SET visible = $1, orden = $2, modificado_por = $3, modificado_en = now()
       WHERE clave = $4`,
      [!!t.visible, t.orden ?? 99, usuario, t.clave]
    );
  }

  logger.info(ENDPOINT, `Configuración actualizada por ${usuario}`, { total: tarjetas.length });
  return res.json({ ok: true });
}));

module.exports = router;
