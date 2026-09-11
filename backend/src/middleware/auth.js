const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'probolsas_dev_secret_key_123';

/**
 * Middleware para validar el token JWT desde la cookie httpOnly
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, nombre, rol }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
  }
}

/**
 * Middleware para requerir un rol específico
 * @param {string} role - El rol requerido (ej. 'admin')
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.rol !== role) {
      return res.status(403).json({ ok: false, error: 'Permisos insuficientes' });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET, // exported for auth.js to use
};
