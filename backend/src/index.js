'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const kpisRouter    = require('./routes/kpis');
const cierresRouter = require('./routes/cierres');
const setupRouter   = require('./routes/setup');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH'],
}));
app.use(express.json());

// ── Rutas ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), env: {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    sp1:   process.env.SPREADSHEET_ID_1?.slice(0, 8) + '…',
    sp2:   process.env.SPREADSHEET_ID_2?.slice(0, 8) + '…',
  }});
});

app.use('/api/setup',    setupRouter);
app.use('/api/kpis',     kpisRouter);
app.use('/api/cierres',  cierresRouter);

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// ── Tareas programadas ────────────────────────────────────────────────────────

require('./cron');

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🟢  Backend corriendo en http://localhost:${PORT}`);
  console.log(`    Health:  http://localhost:${PORT}/api/health`);
  console.log(`    KPIs:    http://localhost:${PORT}/api/kpis`);
  console.log(`    Setup:   POST http://localhost:${PORT}/api/setup\n`);
});
