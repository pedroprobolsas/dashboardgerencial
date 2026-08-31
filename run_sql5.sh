DB_CONTAINER=$(docker ps -q -f name=postgres | head -n 1)
docker exec $DB_CONTAINER psql -U probolsas_user -d probolsas_db -c "SELECT valor FROM app_ops.parametros WHERE clave = 'datos_desactualizados_dias';"
