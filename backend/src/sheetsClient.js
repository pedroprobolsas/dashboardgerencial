'use strict';
require('dotenv').config();
const { google } = require('googleapis');

// ── Autenticación con Service Account ────────────────────────────────────────

function getAuthClient() {
  // El \n en el .env se almacena como literal \\n — lo normalizamos aquí
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

function getSheetsAPI() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Lee un rango de un spreadsheet.
 * @param {string} spreadsheetId
 * @param {string} range  Ej: 'Cierre_Ventas!A:Z'
 * @returns {string[][]} Filas de valores
 */
async function readRange(spreadsheetId, range) {
  const sheets = getSheetsAPI();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

/**
 * Agrega una fila al final de una hoja.
 * @param {string} spreadsheetId
 * @param {string} sheetName   Nombre de la pestaña (no el GID)
 * @param {any[]}  values      Valores en el mismo orden que las columnas
 */
async function appendRow(spreadsheetId, sheetName, values) {
  const sheets = getSheetsAPI();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

/**
 * Actualiza celdas específicas de una fila encontrada por ID_Registro.
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {string} idRegistro    Valor a buscar en la columna A
 * @param {Object} cambios       { columnaLetra: valor } — ej: { G: 'APROBADO', Q: 'Muy bien', R: '...' }
 */
async function updateRowById(spreadsheetId, sheetName, idRegistro, cambios) {
  const sheets = getSheetsAPI();

  // Lee toda la columna A para encontrar la fila
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`,
  });
  const columnaA = res.data.values || [];
  const rowIndex = columnaA.findIndex(row => row[0] === idRegistro);
  if (rowIndex === -1) throw new Error(`ID_Registro "${idRegistro}" no encontrado en ${sheetName}`);

  const rowNumber = rowIndex + 1; // Sheets es 1-indexed

  // Actualiza cada celda indicada
  const requests = Object.entries(cambios).map(([col, valor]) => ({
    range: `${sheetName}!${col}${rowNumber}`,
    values: [[valor]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: requests,
    },
  });

  return rowNumber;
}

/**
 * Verifica si una pestaña existe en el spreadsheet.
 */
async function sheetExists(spreadsheetId, sheetName) {
  const sheets = getSheetsAPI();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.sheets.some(s => s.properties.title === sheetName);
}

/**
 * Crea una nueva pestaña con cabeceras si no existe.
 * @param {string}   spreadsheetId
 * @param {string}   sheetName
 * @param {string[]} headers
 */
async function createSheetIfMissing(spreadsheetId, sheetName, headers) {
  const sheets = getSheetsAPI();
  const exists = await sheetExists(spreadsheetId, sheetName);

  if (!exists) {
    // Crear la pestaña
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    // Escribir la fila de cabeceras
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    return { creada: true };
  }
  return { creada: false };
}

module.exports = { readRange, appendRow, updateRowById, createSheetIfMissing, sheetExists, getSheetsAPI };
