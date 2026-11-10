#!/bin/bash
# Alarma de frescura: avisa por Telegram si una tabla lleva más de 4 días sin datos nuevos,
# o si hay OPs de 2026 con más de 7 días sin su detalle de costeo.
PG=$(docker ps --filter 'name=postgres' -q | head -1)
[ -z "$PG" ] && /root/send-telegram.sh "ALERTA: contenedor de Postgres no encontrado" && exit 1
sql(){ docker exec -i "$PG" psql -U probolsas_user -d probolsas_db -t -A -c "$1" 2>/dev/null; }

ALERTA=""
for t in costo_por_orden:fecha ordenes_cumplidas:fecha_cumplimiento movimientos_materiales:fecha facturas:fecha_creacion ingresos:fecha_creacion consecutivo_egresos:fecha_contable egresos_agrupados_concepto:fecha_contable consecutivo_cxp:fecha_contable facturacion_op:fecha_creacion analisis_cotizaciones:_sync_fecha; do
  TABLA="${t%%:*}"; COL="${t##*:}"
  DIAS=$(sql "SELECT COALESCE(EXTRACT(DAY FROM now() - MAX($COL))::int, 9999) FROM crisolweb.$TABLA;")
  [ -z "$DIAS" ] && DIAS=9999
  LIM=4; [ "$TABLA" = "consecutivo_cxp" ] && LIM=7
  if [ "$DIAS" -gt $LIM ]; then
    if [ "$DIAS" -eq 9999 ]; then ALERTA="${ALERTA}- ${TABLA}: sin datos o error de consulta"$'\n'
    else ALERTA="${ALERTA}- ${TABLA}: ${DIAS} días sin datos nuevos"$'\n'; fi
  fi
done

SIN_DET=$(sql "SELECT count(DISTINCT c.nro_op) FROM crisolweb.costo_por_orden c LEFT JOIN crisolweb.costo_por_orden_detalle d ON d.nro_op = c.nro_op WHERE d.nro_op IS NULL AND c.fecha >= '2026-01-01' AND c.fecha < current_date - 7;")
if [ -n "$SIN_DET" ] && [ "$SIN_DET" -gt 0 ]; then ALERTA="${ALERTA}- detalle de costo por OP: ${SIN_DET} OPs con más de 7 días sin detalle"$'\n'; fi

if [ -n "$ALERTA" ]; then
  /root/send-telegram.sh "⚠️ DATOS DESACTUALIZADOS
${ALERTA}
Revisar /var/log/pipeline-crisolweb.log"
  echo "$ALERTA"; exit 1
fi
echo "✅ Todo fresco"
