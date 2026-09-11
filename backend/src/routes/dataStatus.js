'use strict';

const express = require('express');
const router = express.Router();
const db = require('../dbClient');
const asyncHandler = require('../asyncHandler');

router.get('/', asyncHandler('/api/data-status', async (req, res) => {
  const query = `
    SELECT 
      pipeline_id as id,
      nombre_display as nombre,
      estado,
      ultima_fecha_datos,
      dias_atraso,
      mensaje,
      ultima_verificacion
    FROM app_ops.pipeline_health 
    WHERE activo = true
    ORDER BY 
      CASE 
        WHEN estado = 'rojo' THEN 1
        WHEN estado = 'amarillo' THEN 2
        WHEN estado = 'verde' THEN 3
        ELSE 4
      END,
      nombre_display ASC
  `;
  
  const result = await db.query(query);
  
  let resumen = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  let ultima_verificacin = null;
  
  result.rows.forEach(row => {
    if (resumen[row.estado] !== undefined) {
      resumen[row.estado]++;
    } else {
      resumen.sin_datos++;
    }
    
    if (row.ultima_verificacion) {
      if (!ultima_verificacin || new Date(row.ultima_verificacion) > new Date(ultima_verificacin)) {
        ultima_verificacin = row.ultima_verificacion;
      }
    }
  });

  res.json({
    verificado_en: ultima_verificacin,
    resumen,
    pipelines: result.rows
  });
}));

const { requireRole } = require('../middleware/auth');
const hostAgent = require('../services/hostAgent');
const { verificarEstadoDatos } = require('../services/statusChecker');

// GET /lock-state
router.get('/lock-state', asyncHandler('/api/data-status/lock-state', async (req, res) => {
  const result = await db.query(`
    SELECT l.*, u.email as locked_by_email 
    FROM app_ops.pipeline_locks l
    LEFT JOIN app_ops.usuarios u ON l.locked_by_user_id = u.id
  `);
  
  const locks = {};
  result.rows.forEach(r => {
    locks[r.pipeline_id] = {
      status: r.status,
      locked_by: r.locked_by_email,
      locked_at: r.locked_at,
      elapsed_seconds: r.locked_at ? Math.round((new Date() - new Date(r.locked_at))/1000) : null
    };
  });
  
  res.json({ locks });
}));

// POST /retry/:pipeline
router.post('/retry/:pipeline', requireRole('admin'), asyncHandler('/api/data-status/retry', async (req, res) => {
  const pipeline = req.params.pipeline;
  if (!['crisolweb', 'siigo_saldos'].includes(pipeline)) {
    return res.status(400).json({ error: 'Pipeline inválido' });
  }

  // Verificar lock
  const lockRes = await db.query('SELECT * FROM app_ops.pipeline_locks WHERE pipeline_id = $1', [pipeline]);
  const lock = lockRes.rows[0];
  const now = new Date();
  
  if (lock && lock.status === 'in_progress') {
    const lastHb = lock.last_heartbeat_at ? new Date(lock.last_heartbeat_at) : new Date(lock.locked_at);
    const diffMins = (now - lastHb) / 1000 / 60;
    
    if (diffMins < 30) {
      // Bloqueado
      const usrRes = await db.query('SELECT email FROM app_ops.usuarios WHERE id = $1', [lock.locked_by_user_id]);
      const email = usrRes.rows[0]?.email || 'Desconocido';
      return res.status(409).json({
        error: 'Pipeline en ejecución',
        locked_by: email,
        locked_at: lock.locked_at
      });
    }
    // Si pasaron 30 min, lo robamos silenciosamente
  }

  // Tomar lock
  await db.query(`
    UPDATE app_ops.pipeline_locks 
    SET status = 'in_progress', locked_by_user_id = $1, locked_at = NOW(), last_heartbeat_at = NOW() 
    WHERE pipeline_id = $2
  `, [req.user.id, pipeline]);

  // Insertar action log
  const logRes = await db.query(`
    INSERT INTO app_ops.action_logs (usuario_id, accion, recurso, origen, resultado)
    VALUES ($1, 'RETRY_PIPELINE', $2, 'dashboard_web', 'in_progress')
    RETURNING id
  `, [req.user.id, pipeline]);
  const actionLogId = logRes.rows[0].id;

  // Hacer ping al Host Agent inicial para ver si está vivo con un timeout corto de 3s
  const agentUrl = process.env.HOST_AGENT_URL;
  if (agentUrl) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const hc = await fetch(`${agentUrl.replace(/\/$/, '')}/health`, { signal: controller.signal });
      clearTimeout(t);
      if (!hc.ok) throw new Error('Bad status');
    } catch (e) {
      await db.query(`UPDATE app_ops.pipeline_locks SET status = 'failed', last_error = 'Host Agent no disponible' WHERE pipeline_id = $1`, [pipeline]);
      await db.query(`UPDATE app_ops.action_logs SET resultado = 'failed', detalle = $1 WHERE id = $2`, [JSON.stringify({ reason: 'host_agent_unreachable' }), actionLogId]);
      return res.status(503).json({ error: 'Host Agent no disponible' });
    }
  }

  // Respuesta asíncrona rápida
  res.status(202).json({
    status: 'in_progress',
    lock_id: pipeline,
    started_at: now
  });

  // Background task
  setImmediate(async () => {
    try {
      const result = await hostAgent.runPipeline(pipeline);
      
      await db.query(`
        UPDATE app_ops.pipeline_locks 
        SET status = $1, completed_at = NOW(), last_error = $2
        WHERE pipeline_id = $3
      `, [result.status === 'failed' ? 'failed' : 'completed', result.error || null, pipeline]);
      
      await db.query(`
        UPDATE app_ops.action_logs 
        SET resultado = $1, detalle = $2
        WHERE id = $3
      `, [result.status, JSON.stringify(result), actionLogId]);

      // Refrescar vistas si fue exitoso o parcial
      if (result.status !== 'failed') {
        await verificarEstadoDatos();
      }

    } catch (err) {
      const reason = err.message === 'host_agent_unreachable' ? 'host_agent_unreachable' : err.message;
      await db.query(`UPDATE app_ops.pipeline_locks SET status = 'failed', completed_at = NOW(), last_error = $1 WHERE pipeline_id = $2`, [reason, pipeline]);
      await db.query(`UPDATE app_ops.action_logs SET resultado = 'failed', detalle = $1 WHERE id = $2`, [JSON.stringify({ error: reason }), actionLogId]);
    }
  });

}));

// POST /heartbeat/:lock_id
router.post('/heartbeat/:lock_id', asyncHandler('/api/data-status/heartbeat', async (req, res) => {
  // Validamos is_agent ya que en auth.js le inyectamos req.user.is_agent = true si usa el token correcto
  if (!req.user || !req.user.is_agent) {
    return res.status(403).json({ error: 'Solo el Host Agent puede enviar heartbeats' });
  }

  const { lock_id } = req.params;
  await db.query(`
    UPDATE app_ops.pipeline_locks 
    SET last_heartbeat_at = NOW() 
    WHERE pipeline_id = $1 AND status = 'in_progress'
  `, [lock_id]);
  
  res.json({ ok: true });
}));

module.exports = router;
