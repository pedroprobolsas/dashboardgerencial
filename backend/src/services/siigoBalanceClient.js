'use strict';

const { leerBalanceXlsx } = require('../utils/xlsxBalanceParser');

const SIIGO_AUTH_URL = 'https://api.siigo.com/auth';
const SIIGO_TEST_BALANCE_URL = 'https://api.siigo.com/v1/test-balance-report';
const TIMEOUT_MS = 180000;

/**
 * Lee las credenciales de SIIGO exclusivamente desde las variables de entorno del servicio.
 * @returns {{ user: string, accessKey: string, partnerId: string }}
 */
function obtenerCredencialesSiigo() {
  const user = (process.env.SIIGO_USER || '').trim();
  const accessKey = (process.env.SIIGO_API_ACCESS_KEY || '').trim();
  const partnerId = (process.env.SIIGO_PARTNER_ID || '').trim();

  if (!user || !accessKey) {
    throw new Error('Credenciales de SIIGO no configuradas en las variables de entorno (SIIGO_USER, SIIGO_API_ACCESS_KEY)');
  }

  return { user, accessKey, partnerId };
}

/**
 * Ejecuta una petición POST JSON a la API oficial de SIIGO con timeout de 180s.
 * @param {string} url
 * @param {object} body
 * @param {Record<string, string>} headers
 * @returns {Promise<any>}
 */
async function postJsonSiigo(url, body, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const texto = await response.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch (_err) {
    json = null;
  }

  if (!response.ok) {
    const detalle = json?.Errors?.[0]?.Message || json?.message || json?.error || texto || `HTTP ${response.status}`;
    throw new Error(`Error API SIIGO (${response.status}): ${detalle}`);
  }

  return json;
}

/**
 * Codifica la URL del archivo Excel generado por SIIGO preservando :/?=&%
 * (idéntico a urllib.parse.quote(file_url, safe=':/?=&%') en siigo_api.py).
 * @param {string} fileUrl
 * @returns {string}
 */
function normalizarUrlArchivo(fileUrl) {
  return String(fileUrl).replace(/[^A-Za-z0-9\-_.~:/?=&%]/g, (ch) => encodeURIComponent(ch));
}

/**
 * Obtiene un token Bearer fresco desde https://api.siigo.com/auth.
 * @returns {Promise<{ token: string, partnerId: string }>}
 */
async function autenticarSiigo() {
  const { user, accessKey, partnerId } = obtenerCredencialesSiigo();
  const data = await postJsonSiigo(
    SIIGO_AUTH_URL,
    { username: user, access_key: accessKey },
    { 'Partner-Id': partnerId }
  );

  if (!data || !data.access_token) {
    throw new Error('La respuesta de autenticación de SIIGO no incluyó access_token');
  }

  return { token: data.access_token, partnerId };
}

/**
 * Consulta el balance de prueba de un mes en la API oficial de SIIGO,
 * descarga el archivo Excel y devuelve las cuentas parseadas.
 * Replica exactamente Siigo().balance(anio, mes) de /root/siigo_api.py.
 *
 * @param {number} anio
 * @param {number} mes (1-12)
 * @returns {Promise<ReturnType<typeof leerBalanceXlsx>>}
 */
async function obtenerBalancePruebaMes(anio, mes) {
  let auth;
  try {
    auth = await autenticarSiigo();
  } catch (err) {
    throw new Error(`no se pudo autenticar con la API (${err.message})`);
  }

  let reporte;
  try {
    reporte = await postJsonSiigo(
      SIIGO_TEST_BALANCE_URL,
      {
        year: anio,
        month_start: mes,
        month_end: mes,
        includes_tax_difference: false,
      },
      {
        'Partner-Id': auth.partnerId,
        Authorization: `Bearer ${auth.token}`,
      }
    );
  } catch (err) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    throw new Error(`no se pudo obtener el balance de ${periodo} (${err.message})`);
  }

  if (!reporte || !reporte.file_url) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    throw new Error(`SIIGO no devolvió file_url para el balance de ${periodo}`);
  }

  const urlDescarga = normalizarUrlArchivo(reporte.file_url);
  const resArchivo = await fetch(urlDescarga, {
    method: 'GET',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!resArchivo.ok) {
    throw new Error(`Error descargando Excel de balance SIIGO (HTTP ${resArchivo.status})`);
  }

  const arrayBuffer = await resArchivo.arrayBuffer();
  return leerBalanceXlsx(Buffer.from(arrayBuffer));
}

module.exports = {
  obtenerBalancePruebaMes,
};
