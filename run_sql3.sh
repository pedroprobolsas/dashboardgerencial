DB_CONTAINER=$(docker ps -q -f name=postgres_postgres | head -n 1)
docker exec $DB_CONTAINER psql -U probolsas_user -d probolsas_db -c "UPDATE app_ops.tarjetas_dashboard SET clave = 'sobrecosto-materiales' WHERE clave = 'calidad-registro';"
