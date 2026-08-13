'use strict';
const fs   = require('fs');
const path = require('path');

// ── Directorio de logs ────────────────────────────────────────────────────────

const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

// Crear directorio si no existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── Niveles ───────────────────────────────────────────────────────────────────

const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

/**
 * Formatea una línea de log estructurada.
 * Formato: [ISO_TIMESTAMP] [LEVEL] [CONTEXT] mensaje | detalles
 *
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string}                context  Nombre del endpoint o módulo (e.g. "/api/ventas_mes")
 * @param {string}                message
 * @param {object|null}           meta     Datos adicionales (query params, error details, etc.)
 * @returns {string}
 */
function formatLine(level, context, message, meta) {
  const ts   = new Date().toISOString();
  const base = `[${ts}] [${level}] [${context}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} | ${JSON.stringify(meta)}`;
  }
  return base;
}

/**
 * Escribe en consola + archivo de log.
 * El archivo se abre en modo append; si falla la escritura al archivo,
 * solo loguea a consola sin lanzar excepción.
 */
function write(level, context, message, meta = null) {
  const line = formatLine(level, context, message, meta);

  // Consola (con colores según nivel)
  if (level === LEVELS.ERROR) {
    console.error(line);
  } else if (level === LEVELS.WARN) {
    console.warn(line);
  } else {
    console.log(line);
  }

  // Archivo (best-effort, nunca crashea el proceso)
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {
    // Silenciar errores de escritura al archivo
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * @param {string} context  Nombre del módulo o endpoint
 * @param {string} message  Descripción del evento
 * @param {object} [meta]   Datos adicionales para auditoría
 */
function info(context, message, meta)  { write(LEVELS.INFO,  context, message, meta); }
function warn(context, message, meta)  { write(LEVELS.WARN,  context, message, meta); }
function error(context, message, meta) { write(LEVELS.ERROR, context, message, meta); }

/**
 * Loguea un error de endpoint con todos los datos necesarios para auditoría.
 *
 * @param {string} endpoint  Ruta del endpoint (e.g. "/api/ventas_mes")
 * @param {Error}  err       Error capturado
 * @param {object} params    Query params recibidos en el request
 */
function endpointError(endpoint, err, params = {}) {
  error(endpoint, err.message, {
    params,
    stack: err.stack ? err.stack.split('\n').slice(0, 3).join(' → ') : undefined,
  });
}

module.exports = { info, warn, error, endpointError, LOG_FILE };
