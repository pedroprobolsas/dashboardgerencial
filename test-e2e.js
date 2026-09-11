const { exec } = require('child_process');
const http = require('http');

const TOKEN = 'test_token_123';
process.env.HOST_AGENT_TOKEN = TOKEN;
process.env.PORT = '4999';

console.log("Levantando Host Agent...");
const agent = exec('node host-agent/server.js', { env: process.env });

agent.stdout.on('data', d => console.log('[AGENT]', d.trim()));
agent.stderr.on('data', d => console.error('[AGENT ERR]', d.trim()));

setTimeout(async () => {
  try {
    console.log("\n=== 1. Test /health ===");
    const health = await fetch('http://localhost:4999/health').then(r => r.text());
    console.log(health);

    console.log("\n=== 2. Test /pipeline/crisolweb/run ===");
    const runReq = fetch('http://localhost:4999/pipeline/crisolweb/run', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    // Wait a bit to test concurrency
    setTimeout(async () => {
      console.log("\n=== 3. Test concurrencia (409) ===");
      const concRes = await fetch('http://localhost:4999/pipeline/crisolweb/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` }
      });
      console.log(`Status: ${concRes.status}`, await concRes.text());
    }, 500);

    const runRes = await runReq;
    console.log("\n=== Resultado del Run ===");
    console.log(await runRes.text());

    console.log("\n=== 4. Test /last-run ===");
    const lastRun = await fetch('http://localhost:4999/pipeline/crisolweb/last-run', {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    }).then(r => r.text());
    console.log(lastRun);

  } catch (err) {
    console.error(err);
  } finally {
    console.log("\nLimpiando...");
    agent.kill();
    process.exit(0);
  }
}, 2000);
