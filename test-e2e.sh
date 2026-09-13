#!/bin/bash
set -e

echo "=== Setup ==="
export HOST_AGENT_TOKEN="test_token_123"
export PORT=4999

echo "Iniciando Host Agent en port 4999..."
cd host-agent
node server.js &
AGENT_PID=$!
cd ..

sleep 2

echo -e "\n=== 1. Test /health ==="
curl -sS http://localhost:4999/health

echo -e "\n\n=== 2. Test /pipeline/crisolweb/run (debería fallar rápido sin docker) ==="
# Enviamos al background porque tarda un poco y queremos probar concurrencia/heartbeat
curl -sS -X POST -H "Authorization: Bearer $HOST_AGENT_TOKEN" http://localhost:4999/pipeline/crisolweb/run &
RUN_PID=$!

sleep 1

echo -e "\n\n=== 3. Test concurrencia (debería dar 409) ==="
curl -sS -X POST -H "Authorization: Bearer $HOST_AGENT_TOKEN" http://localhost:4999/pipeline/crisolweb/run || true

echo -e "\n\n=== Esperando a que termine el pipeline ==="
wait $RUN_PID

echo -e "\n\n=== 4. Test /last-run ==="
curl -sS http://localhost:4999/pipeline/crisolweb/last-run

echo -e "\n\n=== Limpieza ==="
kill $AGENT_PID
