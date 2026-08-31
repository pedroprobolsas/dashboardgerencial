DB_CONTAINER=$(docker ps -q -f name=postgres | head -n 1)
docker exec $DB_CONTAINER psql -U probolsas_user -d probolsas_db -c "SELECT MAX(fecha) as max_costo_por_orden FROM crisolweb.costo_por_orden;"
docker exec $DB_CONTAINER psql -U probolsas_user -d probolsas_db -c "SELECT MAX(fecha_cumplimiento) as max_ordenes_cumplidas FROM crisolweb.ordenes_cumplidas;"
