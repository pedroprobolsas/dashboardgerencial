'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const logger = require('./logger');
const cache  = require('./cache');
const { testConnection } = require('./dbClient');

// ── Routers ───────────────────────────────────────────────────────────────────

const kpisRouter           = require('./routes/kpis');
const cierresRouter        = require('./routes/cierres');
const setupRouter          = require('./routes/setup');
const costoPorOrdenRouter  = require('./routes/costoPorOrden');
const ventasMesRouter      = require('./routes/ventasMes');
const carteraPorAsesorRouter = require('./routes/carteraPorAsesor');
const margenGlobalRouter   = require('./routes/margenGlobal');

const app  = express();
const PORT = process.env.PORT || 3001;
const START_TIME = Date.now();

// ── Middleware ────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH'],
}));
app.use(express.json());

// ── Healthcheck mejorado ──────────────────────────────────────────────────────

const ENDPOINTS_REGISTRADOS = [
  'GET  /api/health',
  'GET  /api/kpis',
  'GET  /api/kpis/diario',
  'POST /api/kpis/snapshot',
  'GET  /api/ventas_mes',
  'GET  /api/cartera_por_asesor',
  'GET  /api/costo_por_orden',
  'GET  /api/margen_global',
  'POST /api/setup',
  'GET  /api/cierres/bandeja',
  'POST /api/cierres/:area',
  'GET  /api/cierres/prefill/:area',
];

app.get('/api/health', async (_req, res) => {
  const ts = new Date().toISOString();

  // ── Postgres ────────────────────────────────────────────────────────
  let pgStatus = { ok: false };
  try {
    const pgStart = Date.now();
    const pgResult = await testConnection();
    pgStatus = {
      ok:          pgResult.ok,
      version:     pgResult.version ? pgResult.version.split(',')[0] : undefined,
      latencia_ms: Date.now() - pgStart,
      error:       pgResult.error || undefined,
    };
  } catch (err) {
    pgStatus = { ok: false, error: err.message };
  }

  // ── Google Sheets ───────────────────────────────────────────────────
  const sheetsEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const sheetsStatus = {
    ok:              !!sheetsEmail,
    service_account: sheetsEmail
      ? `${sheetsEmail.split('@')[0].slice(0, 12)}…@${sheetsEmail.split('@')[1]}`
      : undefined,
    sp1_configured:  !!process.env.SPREADSHEET_ID_1,
    sp2_configured:  !!process.env.SPREADSHEET_ID_2,
  };

  // ── Cache ───────────────────────────────────────────────────────────
  const cacheStats = cache.stats();

  const allOk = pgStatus.ok && sheetsStatus.ok;

  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    ts,
    uptime_segundos: Math.round((Date.now() - START_TIME) / 1000),
    servicios: {
      postgres:      pgStatus,
      google_sheets: sheetsStatus,
    },
    cache: {
      entradas: cacheStats.entries,
    },
    endpoints_registrados: ENDPOINTS_REGISTRADOS,
  });
});

// ── Rutas ─────────────────────────────────────────────────────────────────────

// Endpoints existentes (compatibilidad)
app.use('/api/setup',             setupRouter);
app.use('/api/kpis',              kpisRouter);
app.use('/api/cierres',           cierresRouter);

// Endpoints REST individuales (arquitectura nueva)
app.use('/api/costo_por_orden',   costoPorOrdenRouter);
app.use('/api/ventas_mes',        ventasMesRouter);
app.use('/api/cartera_por_asesor', carteraPorAsesorRouter);
app.use('/api/margen_global',     margenGlobalRouter);

// ── Error handler global ──────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  logger.error('global', err.message, {
    method: req.method,
    url:    req.originalUrl,
    stack:  err.stack ? err.stack.split('\n').slice(0, 3).join(' → ') : undefined,
  });
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Tareas programadas ────────────────────────────────────────────────────────

require('./cron');

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info('server', `Backend corriendo en http://localhost:${PORT}`);
  console.log(`\n🟢  Backend corriendo en http://localhost:${PORT}`);
  console.log(`    Health:           http://localhost:${PORT}/api/health`);
  console.log(`    KPIs (monolítico): http://localhost:${PORT}/api/kpis`);
  console.log(`    Ventas Mes:       http://localhost:${PORT}/api/ventas_mes`);
  console.log(`    Cartera Asesor:   http://localhost:${PORT}/api/cartera_por_asesor`);
  console.log(`    Costo por Orden:  http://localhost:${PORT}/api/costo_por_orden`);
  console.log(`    Margen Global:    http://localhost:${PORT}/api/margen_global`);
  console.log(`    Setup:            POST http://localhost:${PORT}/api/setup\n`);
});
