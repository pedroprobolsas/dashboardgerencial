#!/bin/bash
# Relleno único del detalle por OP de 2026: tandas de 10 hasta terminar.
# Se detiene si una tanda falla, si no avanza o si se acerca el pipeline diario (14:00 servidor).
LOG=/var/log/relleno-detalle-op.log
PG=$(docker ps --filter 'name=postgres' -q | head -1)
pend(){ docker exec -i "$PG" psql -U probolsas_user -d probolsas_db -t -A -c "SELECT count(DISTINCT c.nro_op) FROM crisolweb.costo_por_orden c LEFT JOIN crisolweb.costo_por_orden_detalle d ON d.nro_op = c.nro_op WHERE d.nro_op IS NULL AND c.fecha >= '2026-01-01';"; }
tg(){ [ -x /root/send-telegram.sh ] && /root/send-telegram.sh "$1"; }
echo "[$(date '+%F %T')] INICIO relleno — pendientes: $(pend)" >> $LOG
for i in $(seq 1 25); do
  H=$(date +%-H); if [ $H -ge 12 ] && [ $H -lt 15 ]; then echo "[$(date '+%F %T')] Pausa: se acerca el pipeline diario" >> $LOG; break; fi
  ANTES=$(pend); [ "$ANTES" -eq 0 ] && break
  exec 9>/var/lock/pipeline-crisolweb.lock
  flock -w 600 9 || { echo "[$(date '+%F %T')] Candado ocupado, me detengo" >> $LOG; break; }
  /root/trigger-detalle-op.sh 10 >> $LOG 2>&1; RC=$?
  flock -u 9
  DESPUES=$(pend)
  echo "[$(date '+%F %T')] tanda $i: rc=$RC — pendientes $ANTES → $DESPUES" >> $LOG
  if [ $RC -ne 0 ]; then tg "❌ Relleno detalle OP se detuvo en la tanda $i. Ver $LOG"; exit 1; fi
  if [ "$DESPUES" -ge "$ANTES" ]; then tg "⚠️ Relleno detalle OP sin avance en la tanda $i, quedan $DESPUES OPs. Ver $LOG"; exit 1; fi
done
echo "[$(date '+%F %T')] FIN — pendientes: $(pend)" >> $LOG
tg "✅ Relleno detalle OP 2026 terminado. Pendientes: $(pend)"
