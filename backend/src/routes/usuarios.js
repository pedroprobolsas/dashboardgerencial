'use strict';
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../dbClient');
const asyncHandler = require('../asyncHandler');
const { requireRole } = require('../middleware/auth');
const logger = require('../logger');

const router = Router();
const ENDPOINT = '/api/usuarios';

// Todas las rutas en /api/usuarios requieren rol de 'admin'
router.use(requireRole('admin'));

/**
 * GET /api/usuarios
 * Lista todos los usuarios
 */
router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { rows } = await query('SELECT id, email, nombre, rol, activo, ultimo_acceso, creado_en FROM app_ops.usuarios ORDER BY nombre ASC');
  return res.json({ ok: true, usuarios: rows });
}));

/**
 * POST /api/usuarios
 * Crea un nuevo usuario
 */
router.post('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { email, nombre, password, rol } = req.body;
  if (!email || !nombre || !password || !rol) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
  }

  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  try {
    const { rows } = await query(
      `INSERT INTO app_ops.usuarios (email, nombre, password_hash, rol, creado_por) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, nombre, rol, activo, creado_en`,
      [email, nombre, hash, rol, req.user.email]
    );
    logger.info(ENDPOINT, `Usuario creado por ${req.user.email}: ${email}`);
    return res.status(201).json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(400).json({ ok: false, error: 'El email ya está registrado' });
    }
    throw err;
  }
}));

/**
 * PATCH /api/usuarios/:id
 * Cambia rol, estado activo, o nombre
 */
router.patch('/:id', asyncHandler(ENDPOINT, async (req, res) => {
  const { id } = req.params;
  const { nombre, rol, activo } = req.body;

  const updates = [];
  const values = [];
  let paramIdx = 1;

  if (nombre !== undefined) {
    updates.push(`nombre = $${paramIdx++}`);
    values.push(nombre);
  }
  if (rol !== undefined) {
    updates.push(`rol = $${paramIdx++}`);
    values.push(rol);
  }
  if (activo !== undefined) {
    updates.push(`activo = $${paramIdx++}`);
    values.push(activo);
  }

  if (updates.length === 0) {
    return res.json({ ok: true });
  }

  values.push(id);
  const sql = `UPDATE app_ops.usuarios SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING id, email, nombre, rol, activo`;
  
  const { rows } = await query(sql, values);
  if (rows.length === 0) {
    return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
  }

  logger.info(ENDPOINT, `Usuario ${rows[0].email} modificado por ${req.user.email}`);
  return res.json({ ok: true, usuario: rows[0] });
}));

/**
 * POST /api/usuarios/:id/reset-password
 * Resetea la contraseña de un usuario
 */
router.post('/:id/reset-password', asyncHandler(ENDPOINT, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña es requerida' });
  }

  const saltRounds = 10;
  const hash = await bcrypt.hash(newPassword, saltRounds);

  const { rowCount } = await query('UPDATE app_ops.usuarios SET password_hash = $1 WHERE id = $2', [hash, id]);
  if (rowCount === 0) {
    return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
  }

  logger.info(ENDPOINT, `Contraseña de usuario ID ${id} reseteada por ${req.user.email}`);
  return res.json({ ok: true });
}));

module.exports = router;
