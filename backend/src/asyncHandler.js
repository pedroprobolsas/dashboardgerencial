'use strict';
const logger = require('./logger');

/**
 * Wrapper para route handlers de Express que estandariza el manejo de errores.
 *
 * Uso:
 *   router.get('/', asyncHandler('/api/ventas_mes', async (req, res) => { ... }));
 *
 * Si el handler lanza cualquier excepción:
 *   1. Loguea el error con el logger estructurado (endpoint + params + stack)
 *   2. Responde HTTP 500 con un JSON estandarizado
 *   3. Nunca propaga la excepción al middleware global (no crashea el proceso)
 *
 * @param {string}   endpointName  Nombre descriptivo del endpoint para logs
 * @param {Function} fn            Async route handler (req, res) => Promise<void>
 * @returns {Function}             Express middleware
 */
function asyncHandler(endpointName, fn) {
  return async (req, res, _next) => {
    try {
      await fn(req, res);
    } catch (err) {
      // Loguear con contexto completo para auditoría
      logger.endpointError(endpointName, err, req.query || {});

      // Respuesta estandarizada — el frontend puede detectar ok:false
      // y mostrar "Error de lectura" en el widget correspondiente
      if (!res.headersSent) {
        res.status(500).json({
          ok:       false,
          error:    'Error de lectura',
          endpoint: endpointName,
          detalle:  err.message,
          ts:       new Date().toISOString(),
        });
      }
    }
  };
}

module.exports = asyncHandler;
