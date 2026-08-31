cat backend/scripts/test-kpi-1.js | ssh -i ~/.ssh/id_vps_probolsas root@ippgerencia.probolsas.co "docker exec -i $(docker ps -q -f name=dashboard | head -n 1) node"
