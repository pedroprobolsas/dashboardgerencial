#!/usr/bin/env bash

set -u
export TZ=America/Bogota

SYNC="/root/sync-movimientos-materiales.sh"
LOG="/var/log/sync-movimientos-materiales.log"

OC=$(docker ps --format '{{.Names}}' | grep -i openclaw | head -1)
PG=$(docker ps --format '{{.Names}}' | grep '^postgres_postgres' | head -1)

# Reutiliza silenciosamente la configuración Telegram que ya funciona.
BOT_TOKEN=$(docker exec "$OC" sh -lc \
  "awk -F'\"' '/^BOT_TOKEN=/{print \$2; exit}' /home/node/.openclaw/workspace/crisolweb-cron.sh")

CHAT_ID=$(docker exec "$OC" sh -lc \
  "awk -F'\"' '/^CHAT_ID=/{print \$2; exit}' /home/node/.openclaw/workspace/crisolweb-cron.sh")

send_telegram() {
    local MSG="$1"

    if [ -z "${BOT_TOKEN:-}" ] || [ -z "${CHAT_ID:-}" ]; then
        echo "Telegram no configurado" >> "$LOG"
        return 0
    fi

    curl -fsS --max-time 15 \
      -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${CHAT_ID}" \
      --data-urlencode "text=${MSG}" \
      >/dev/null 2>&1 || true
}

# Modo prueba: NO ejecuta Crisolweb ni PostgreSQL.
if [ "${1:-}" = "--test" ]; then
    send_telegram "✅ Prueba Movimientos Materiales — notificación Telegram funcionando."
    echo "Prueba Telegram enviada"
    exit 0
fi

HOY=$(date '+%Y-%m-%d')
FI=$(date -d '7 days ago' '+%Y-%m-%d')

if "$SYNC"; then

    INFO=$(docker exec "$PG" \
      psql -At -F '|' \
      -U probolsas_user \
      -d probolsas_db \
      -c "
      SELECT
          COUNT(*) FILTER (
              WHERE _sync_origen = 'cron_d7_${HOY}'
          ),
          COUNT(*),
          COALESCE(MAX(fecha)::text,'')
      FROM crisolweb.movimientos_materiales;
      ")

    IFS='|' read -r SINCRONIZADOS TOTAL HASTA <<< "$INFO"

    FI_TXT=$(date -d "$FI" '+%d/%m/%Y')
    HOY_TXT=$(date -d "$HOY" '+%d/%m/%Y')

    if [ -n "$HASTA" ]; then
        HASTA_TXT=$(date -d "$HASTA" '+%d/%m/%Y')
    else
        HASTA_TXT="Sin datos"
    fi

    send_telegram "✅ Movimientos Materiales actualizado

Sincronizados: ${SINCRONIZADOS} movimientos
Tabla: ${TOTAL} filas
Información hasta: ${HASTA_TXT}
Rango revisado: ${FI_TXT} → ${HOY_TXT}"

    exit 0

else
    RC=$?

    send_telegram "❌ Movimientos Materiales NO actualizado

Proceso abortado.
No se confirmó actualización en PostgreSQL.
Revisar: ${LOG}"

    exit "$RC"
fi
