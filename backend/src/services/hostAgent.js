'use strict';

async function runPipeline(pipelineName) {
  const agentUrl = process.env.HOST_AGENT_URL;
  const token = process.env.HOST_AGENT_TOKEN;
  
  if (!agentUrl || !token) {
    throw new Error('Configuración de Host Agent (URL o TOKEN) faltante');
  }

  const url = `${agentUrl.replace(/\/$/, '')}/pipeline/${pipelineName}/run`;
  
  // Timeout de 25 min para esta llamada larga
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25 * 60 * 1000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 401) throw new Error('Token de Host Agent inválido');
    if (res.status === 503 || res.status === 502) throw new Error('host_agent_unreachable');
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Error del Host Agent HTTP ${res.status}: ${txt}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Timeout esperando respuesta del Host Agent (25 min)');
    }
    
    console.error('[HOST_AGENT] Fetch error crudo:', {
      name: err.name,
      message: err.message,
      causeCode: err.cause?.code,
      causeMessage: err.cause?.message,
      stack: err.stack
    });
    
    // Solo ECONNREFUSED es realmente "unreachable"
    if (err.cause?.code === 'ECONNREFUSED') {
      throw new Error('host_agent_unreachable');
    }
    
    // Todo lo demás (incluyendo "fetch failed") es un error de comunicación mid-flight
    throw new Error(`Comunicación con Host Agent interrumpida: ${err.message}`);
  }
}

// Exportar
module.exports = {
  runPipeline
};
