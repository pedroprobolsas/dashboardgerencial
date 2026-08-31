#!/bin/bash
# crisolweb-cron.sh — Sync tablero gerencial + notificación Telegram

BOT_TOKEN="8654637941:AAFFsw3V4wf8oJUE8fVvlmzXpEFuKVci-qs"
CHAT_ID="6713840887"
WORKSPACE="/home/node/.openclaw/workspace"

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"$1\",\"parse_mode\":\"Markdown\"}" > /dev/null
}

echo "[$(date)] Iniciando sync Crisolweb..."
send_telegram "⏳ *Tablero Gerencial* — Iniciando sync $(date '+%d/%m/%Y %H:%M')..."

cd "$WORKSPACE"

# R1-R4
echo "[$(date)] Corriendo R1-R4..."
OUTPUT1=$(node crisolweb-sync.js 2>&1)
EXIT1=$?

# R5-R8
echo "[$(date)] Corriendo R5-R8..."
OUTPUT2=$(node crisolweb-sync-r5r8.js 2>&1)
EXIT2=$?

# Parsear resultados
parse_result() {
  echo "$1" | grep -E "✅|❌" | grep -v "Login\|Triggering\|Dates\|Frame\|filas" | tail -20
}

SUMMARY1=$(parse_result "$OUTPUT1")
SUMMARY2=$(parse_result "$OUTPUT2")

# Contar OK/fail
OK=$(echo -e "$OUTPUT1\n$OUTPUT2" | grep -c "^✅" || true)
FAIL=$(echo -e "$OUTPUT1\n$OUTPUT2" | grep -c "^❌" || true)

# Extraer filas
FILAS=$(echo -e "$OUTPUT1\n$OUTPUT2" | grep "✅ [0-9]* filas" | sed 's/  ✅ //' | tr '\n' ' ')

if [ "$FAIL" -eq 0 ]; then
  MSG="✅ *Tablero Gerencial* — $(date '+%d/%m/%Y %H:%M Bogotá')
8/8 reportes OK

$FILAS"
else
  MSG="⚠️ *Tablero Gerencial* — $(date '+%d/%m/%Y %H:%M Bogotá')
${OK}/8 reportes OK | ${FAIL} fallaron

Detalle R1-R4:
$SUMMARY1

Detalle R5-R8:
$SUMMARY2"
fi

send_telegram "$MSG"
echo "[$(date)] Sync Sheets completo. OK=$OK FAIL=$FAIL"



echo "[$(date)] Proceso completo."
