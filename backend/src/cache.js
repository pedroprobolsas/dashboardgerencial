'use strict';

/**
 * Cache in-memory con TTL configurable.
 *
 * Uso:
 *   const cache = require('./cache');
 *
 *   // Intentar leer del cache
 *   const cached = cache.get('ventas_mes:2026-07-01:2026-07-31');
 *   if (cached) return res.json(cached);
 *
 *   // ... ejecutar query ...
 *
 *   // Guardar en cache (5 minutos)
 *   cache.set('ventas_mes:2026-07-01:2026-07-31', resultado, 5 * 60 * 1000);
 *
 * Notas:
 *   - No tiene límite de tamaño: las entradas expiradas se limpian cada 60s
 *   - Para consultas pesadas (sin filtro, scan completo), usar TTL más largo
 *   - Thread-safe en Node.js (single-threaded event loop)
 */

const store = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos
const CLEANUP_INTERVAL_MS = 60 * 1000; // Limpieza cada 60 segundos

/**
 * Obtiene un valor del cache si existe y no ha expirado.
 * @param {string} key
 * @returns {*|null}  El valor cacheado, o null si no existe / expiró
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Guarda un valor en el cache con TTL.
 * @param {string} key
 * @param {*}      value     Cualquier valor serializable
 * @param {number} [ttlMs]  Tiempo de vida en milisegundos (default: 5 min)
 */
function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Invalida una entrada específica del cache.
 * @param {string} key
 */
function del(key) {
  store.delete(key);
}

/**
 * Limpia todas las entradas del cache.
 */
function clear() {
  store.clear();
}

/**
 * Devuelve estadísticas del cache para diagnóstico.
 * @returns {{ entries: number, keys: string[] }}
 */
function stats() {
  // Limpiar expirados primero
  cleanup();
  return {
    entries: store.size,
    keys: Array.from(store.keys()),
  };
}

/**
 * Elimina todas las entradas expiradas.
 */
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

// Limpieza periódica automática
const _cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
// No bloquear el shutdown del proceso
if (_cleanupTimer.unref) _cleanupTimer.unref();

module.exports = { get, set, del, clear, stats, DEFAULT_TTL_MS };
