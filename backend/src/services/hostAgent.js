'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');

async function runPipeline(pipelineName) {
  const agentUrl = process.env.HOST_AGENT_URL;
  const token = process.env.HOST_AGENT_TOKEN;
  
  if (!agentUrl || !token) {
    throw new Error('Configuración de Host Agent (URL o TOKEN) faltante');
  }

  const endpointUrl = `${agentUrl.replace(/\/$/, '')}/pipeline/${pipelineName}/run`;
  const urlObj = new URL(endpointUrl);
  const client = urlObj.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    // Timeout de 25 min
    const timeoutMs = 25 * 60 * 1000;
    let timedOut = false;

    const req = client.request(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: timeoutMs // socket timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (timedOut) return;

        if (res.statusCode === 401) return reject(new Error('Token de Host Agent inválido'));
        if (res.statusCode === 503 || res.statusCode === 502) return reject(new Error('host_agent_unreachable'));
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Error del Host Agent HTTP ${res.statusCode}: ${data}`));
        }

        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Respuesta inválida JSON: ${data.substring(0, 50)}`));
        }
      });
    });

    req.on('timeout', () => {
      timedOut = true;
      req.destroy();
      reject(new Error('Timeout esperando respuesta del Host Agent (25 min)'));
    });

    req.on('error', (err) => {
      if (timedOut) return;
      
      console.error('[HOST_AGENT] HTTP request error:', err);
      
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('host_agent_unreachable'));
      } else {
        reject(new Error(`Comunicación con Host Agent interrumpida: ${err.message}`));
      }
    });

    req.write(JSON.stringify({}));
    req.end();
  });
}

module.exports = {
  runPipeline
};
