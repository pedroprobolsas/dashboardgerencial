#!/bin/bash
# Carga los SQL generados a Postgres. Corta en el primer error y lo muestra (ON_ERROR_STOP).
OCLAW=$(docker ps --filter 'name=openclaw-gateway' -q | head -1)
PG=$(docker ps --filter 'name=postgres' -q | head -1)
FALLAS=0
cargar(){
  local t="$1" f="$2"
  if ! docker cp "${OCLAW}:/home/node/.openclaw/workspace/sql_historico/${f}.sql" /tmp/${f}.sql 2>/dev/null; then
    echo "❌ $t (no se pudo copiar el archivo)"; FALLAS=1; return; fi
  grep -qi "insert" /tmp/${f}.sql || echo "⚠️ $t: el archivo no trae filas"
  if docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -q -U probolsas_user -d probolsas_db < /tmp/${f}.sql > /tmp/${f}.out 2>&1; then
    echo "✅ $t"
  else
    echo "❌ $t: $(grep -m1 -i error /tmp/${f}.out)"; FALLAS=1
  fi
  rm -f /tmp/${f}.sql /tmp/${f}.out
}
for t in facturas ingresos facturacion_op consecutivo_cxp consecutivo_egresos analisis_cotizaciones costo_por_orden cartera_por_pagar egresos_agrupados_concepto ordenes_cumplidas; do  # costo_por_orden_detalle fuera desde 2026-11-09: archivo congelado del 3/sep con duplicados
  cargar "$t" "$t"
done
cargar vistazo_diario vistazo_diario_cron
exit $FALLAS
