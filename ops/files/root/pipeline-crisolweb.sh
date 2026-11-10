#!/usr/bin/env bash
# Orquestador único Crisolweb -> Postgres. Lo usan el cron y el botón Reintentar.
# Pasos en secuencia, nunca dos corridas a la vez, aviso a Telegram al final.
set -u
export TZ=America/Bogota
LOG=/var/log/pipeline-crisolweb.log
WS=/home/node/.openclaw/workspace

exec 9>/var/lock/pipeline-crisolweb.lock
if ! flock -n 9; then
  echo "[$(date '+%F %T')] Ya hay una corrida en curso; no arranco otra." | tee -a "$LOG"; exit 75
fi

OC=$(docker ps -qf "name=openclaw-gateway" | head -1)
[ -z "$OC" ] && { echo "[$(date '+%F %T')] ❌ OpenClaw no está corriendo" | tee -a "$LOG"; exit 1; }

BOT_TOKEN=$(docker exec "$OC" sh -lc "awk -F'\"' '/^BOT_TOKEN=/{print \$2; exit}' $WS/crisolweb-cron.sh")
CHAT_ID=$(docker exec "$OC" sh -lc "awk -F'\"' '/^CHAT_ID=/{print \$2; exit}' $WS/crisolweb-cron.sh")
tg(){ [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ] && curl -fsS --max-time 15 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" --data-urlencode "chat_id=${CHAT_ID}" --data-urlencode "text=$1" >/dev/null 2>&1; true; }

RUN=$(mktemp -d); FALLAS=""; INICIO=$(date +%s)
echo "[$(date '+%F %T')] ===== INICIO PIPELINE =====" >> "$LOG"

paso(){
  local n="$1"; shift
  local f="$RUN/paso.out" s=$(date +%s) rc
  echo "[$(date '+%F %T')] ▶ $n" >> "$LOG"
  "$@" > "$f" 2>&1; rc=$?
  cat "$f" >> "$LOG"
  local d=$(( $(date +%s) - s ))
  if [ $rc -ne 0 ] || grep -q "❌" "$f"; then
    FALLAS="${FALLAS}• $n (código $rc)"$'\n'
    echo "[$(date '+%F %T')] ❌ $n — código $rc — ${d}s" >> "$LOG"
  else
    echo "[$(date '+%F %T')] ✅ $n — ${d}s" >> "$LOG"
  fi
}

paso "1/6 Scrape Crisolweb R1-R8" docker exec "$OC" timeout -k 30 1200 bash $WS/crisolweb-cron.sh
paso "2/6 Generar SQL"            docker exec "$OC" timeout -k 30 1200 node $WS/gen-upsert-sql.mjs
paso "3/6 Órdenes Cumplidas"      docker exec "$OC" timeout -k 30 600 node $WS/cron-ordenes-cumplidas.mjs
paso "4/6 Cargar a Postgres"      timeout -k 30 900 /root/sync-postgres-from-host.sh
paso "5/6 Movimientos Materiales" timeout -k 30 900 /root/run-sync-movimientos-materiales.sh
paso "6/6 Detalle costo por OP"   timeout -k 30 900 /root/trigger-detalle-op.sh 6

MIN=$(( ($(date +%s) - INICIO) / 60 )); rm -rf "$RUN"
if [ -z "$FALLAS" ]; then
  echo "[$(date '+%F %T')] ===== FIN OK (${MIN} min) =====" >> "$LOG"
  tg "✅ Pipeline Crisolweb completo en ${MIN} min"; exit 0
else
  echo "[$(date '+%F %T')] ===== FIN CON FALLAS (${MIN} min) =====" >> "$LOG"
  tg "❌ Pipeline Crisolweb con fallas (${MIN} min):
${FALLAS}Revisar /var/log/pipeline-crisolweb.log"; exit 1
fi
