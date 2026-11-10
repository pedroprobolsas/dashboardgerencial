#!/bin/bash
# Descarga el detalle de costeo por OP (PostCosteo) de OPs de 2026 en adelante que aún no lo tienen.
# Uso: trigger-detalle-op.sh [cantidad]   (por defecto 6; las más recientes primero)
LIMITE=${1:-6}
OCLAW=$(docker ps --filter 'name=openclaw-gateway' -q | head -1)
PG=$(docker ps --filter 'name=postgres' -q | head -1)
if [ -z "$OCLAW" ] || [ -z "$PG" ]; then echo "❌ OpenClaw o Postgres no encontrado"; exit 1; fi

OPS=$(docker exec -i "$PG" psql -U probolsas_user -d probolsas_db -t -A -c "
  SELECT string_agg(nro_op, ' ')
  FROM (SELECT DISTINCT c.nro_op, c.fecha FROM crisolweb.costo_por_orden c
        LEFT JOIN crisolweb.costo_por_orden_detalle d ON d.nro_op = c.nro_op
        WHERE d.nro_op IS NULL AND c.fecha >= '2026-01-01'
        ORDER BY c.fecha DESC LIMIT $LIMITE) t;")

if [ -z "$OPS" ]; then echo "Sin OPs pendientes"; exit 0; fi
echo "Procesando: $OPS"
docker exec "$OCLAW" timeout -k 10 900 node /home/node/.openclaw/workspace/gen-detalle-op.mjs $OPS || { echo "❌ descarga del detalle falló"; exit 1; }
docker cp "${OCLAW}:/home/node/.openclaw/workspace/sql_historico/costo_por_orden_detalle.sql" /tmp/det.sql || { echo "❌ no se pudo copiar el SQL"; exit 1; }
if docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -q -U probolsas_user -d probolsas_db < /tmp/det.sql > /tmp/det.out 2>&1; then
  echo "✅ detalle cargado"; RC=0
else
  echo "❌ carga del detalle falló: $(grep -m1 -i error /tmp/det.out)"; RC=1
fi
rm -f /tmp/det.sql /tmp/det.out
exit $RC
