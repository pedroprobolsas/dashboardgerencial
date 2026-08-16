'use strict';
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../dbClient');
const asyncHandler = require('../asyncHandler');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const logger = require('../logger');

const router = Router();
const ENDPOINT = '/api/auth';

/**
 * POST /api/auth/login
 */
router.post('/login', asyncHandler(ENDPOINT, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña son requeridos' });
  }

  const { rows } = await query('SELECT id, email, nombre, password_hash, rol, activo FROM app_ops.usuarios WHERE email = $1', [email]);
  const user = rows[0];

  if (!user || !user.activo) {
    return res.status(401).json({ ok: false, error: 'Credenciales inválidas o usuario inactivo' });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ ok: false, error: 'Credenciales inválidas o usuario inactivo' });
  }

  // Actualizar último acceso
  await query('UPDATE app_ops.usuarios SET ultimo_acceso = NOW() WHERE id = $1', [user.id]);

  const payload = {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  // Guardar en cookie httpOnly
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000 // 12 horas
  });

  logger.info(ENDPOINT, `Usuario logueado exitosamente: ${email}`);
  
  return res.json({
    ok: true,
    user: payload,
  });
}));

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ ok: true });
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  return res.json({ ok: true, user: req.user });
});

module.exports = router;
