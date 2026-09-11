const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3999;
const TOKEN = process.env.INTERNAL_API_TOKEN || process.env.HOST_AGENT_TOKEN;

if (!TOKEN) {
  console.error("FATAL: HOST_AGENT_TOKEN / INTERNAL_API_TOKEN not found in env.");
  process.exit(1);
}

// Cargar y validar pipelines
let pipelines = {};
try {
  const fileStr = fs.readFileSync(path.join(__dirname, 'pipelines.yml'), 'utf8');
  pipelines = yaml.parse(fileStr);
  if (!pipelines || typeof pipelines !== 'object') throw new Error("YAML inválido");
  console.log(`[INIT] ${Object.keys(pipelines).length} pipelines cargados.`);
} catch (err) {
  console.error("FATAL: Error al cargar pipelines.yml:", err.message);
  process.exit(1);
}

// Almacén en memoria de última corrida por pipeline
const lastRuns = {};
// Estados en progreso
const activeRuns = {};

// Middleware auth
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Función utilitaria para ejecutar comando con timeout
function runCommand(cmd, timeoutMinutes, logFile) {
  return new Promise((resolve, reject) => {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const child = exec(cmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
      // Guardar logs
      const logEntry = `\n--- CMD: ${cmd} ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\n`;
      fs.appendFileSync(logFile, logEntry);
      
      if (error) {
        if (error.killed) {
          resolve({ success: false, reason: 'timeout', output: logEntry });
        } else {
          resolve({ success: false, reason: `exit_code_${error.code}`, output: logEntry });
        }
      } else {
        resolve({ success: true, output: logEntry });
      }
    });
  });
}

app.post('/pipeline/:name/run', async (req, res) => {
  const { name } = req.params;
  const config = pipelines[name];
  
  if (!config) return res.status(404).json({ error: "Pipeline no encontrado en YAML" });
  if (activeRuns[name]) return res.status(409).json({ error: "Pipeline ya está corriendo en el agente" });
  
  activeRuns[name] = true;
  
  // Respondemos 202 Inmediatamente si piden async, o esperamos si es sincrono?
  // El dashboard espera la respuesta completa, dice la instrucción:
  // "Al final, devuelve { status: 'success' | 'partial' | 'failed', steps: [...], duration_seconds: N, log_path: '...' }"
  // Wait, el dashboard hace setImmediate/timeout en SU backend. O sea llama y el agent le responde al final.
  
  // Preparar log file
  const logDir = '/var/log/host-agent';
  if (!fs.existsSync(logDir)) {
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) { /* ignore */ }
  }
  const logFile = path.join(logDir, `retry-${name}-${Date.now()}.log`);
  fs.writeFileSync(logFile, `Iniciando pipeline: ${name}\n`);
  
  const startedAt = new Date();
  lastRuns[name] = {
    started_at: startedAt.toISOString(),
    status: 'in_progress',
    log_file: logFile
  };
  
  let currentStatus = 'success';
  let errorSummary = null;
  const stepResults = [];
  
  try {
    // 1. Pre hook
    if (config.pre_hook) {
      console.log(`[${name}] Ejecutando pre_hook...`);
      await runCommand(config.pre_hook, 1, logFile);
      // Wait 3 seconds
      await new Promise(r => setTimeout(r, 3000));
    }
    
    // 2. Pasos
    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      console.log(`[${name}] Ejecutando paso ${i+1}/${config.steps.length}: ${step.name}`);
      const result = await runCommand(step.command, step.timeout_minutes, logFile);
      
      stepResults.push({
        name: step.name,
        success: result.success,
        reason: result.reason
      });
      
      if (!result.success) {
        currentStatus = 'failed';
        errorSummary = `Paso '${step.name}' falló: ${result.reason}`;
        break; // Detener en el primer fallo
      }
    }
  } catch (err) {
    currentStatus = 'failed';
    errorSummary = err.message;
    fs.appendFileSync(logFile, `\nEXCEPCIÓN INTERNA: ${err.message}`);
  }
  
  const endedAt = new Date();
  const durationSec = Math.round((endedAt - startedAt) / 1000);
  
  lastRuns[name].ended_at = endedAt.toISOString();
  lastRuns[name].status = currentStatus;
  lastRuns[name].error_summary = errorSummary;
  delete activeRuns[name];
  
  res.json({
    status: currentStatus,
    steps: stepResults,
    duration_seconds: durationSec,
    log_path: logFile,
    error: errorSummary
  });
});

app.get('/pipeline/:name/last-run', (req, res) => {
  const { name } = req.params;
  const run = lastRuns[name];
  if (!run) return res.status(404).json({ error: "No hay corridas registradas en memoria" });
  
  let logTail = "";
  if (run.log_file && fs.existsSync(run.log_file)) {
    try {
      const content = fs.readFileSync(run.log_file, 'utf8');
      const lines = content.split('\n');
      logTail = lines.slice(-100).join('\n');
    } catch (e) {
      logTail = "Error leyendo archivo de log";
    }
  }
  
  res.json({
    started_at: run.started_at,
    ended_at: run.ended_at,
    status: run.status,
    error_summary: run.error_summary,
    log_tail: logTail
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Host Agent escuchando en 0.0.0.0:${PORT}`);
});
