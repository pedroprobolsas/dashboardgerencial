DB_CONTAINER=$(docker ps -q -f name=postgres | head -n 1)
docker exec $DB_CONTAINER psql -U probolsas_user -d probolsas_db -c "UPDATE app_ops.parametros SET valor = 4 WHERE clave = 'datos_desactualizados_dias';"
