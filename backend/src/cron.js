'use strict';
const cron = require('node-cron');
const { ejecutarSnapshot } = require('./routes/kpis');
const { verificarEstadoDatos } = require('./services/statusChecker');

// Guarda la foto del día en Vistazo_Diario_Historico todos los días a las 11:00 PM
// hora Colombia (America/Bogota). El cron corre en UTC — 23:00 COT = 04:00 UTC+1
// node-cron soporta timezone nativo, así que usamos eso directamente.

cron.schedule('0 23 * * *', async () => {
  console.log('[CRON] Iniciando snapshot diario…');
  try {
    const resultado = await ejecutarSnapshot();
    if (resultado.ok) {
      console.log(`[CRON] Snapshot guardado: ${resultado.fecha} | ventas: ${resultado.ventasHoy} | egresos: ${resultado.egresosHoy} | cobros: ${resultado.cobrosHoy}`);
    } else {
      console.warn(`[CRON] Snapshot omitido: ${resultado.motivo}`);
    }
  } catch (err) {
    console.error('[CRON] Error al guardar snapshot:', err.message);
  }
}, {
  timezone: 'America/Bogota',
});

console.log('[CRON] Snapshot diario programado: 11:00 PM hora Colombia');

// Verifica el estado de los datos 2 veces al día: 10:00 AM y 3:00 PM
cron.schedule('0 10,15 * * *', async () => {
  console.log('[CRON] Ejecutando verificación de estado de datos...');
  await verificarEstadoDatos();
}, {
  timezone: 'America/Bogota',
});

console.log('[CRON] Verificación de datos programada: 10:00 AM y 3:00 PM hora Colombia');
