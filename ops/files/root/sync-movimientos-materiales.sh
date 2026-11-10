#!/usr/bin/env bash

set -Eeuo pipefail
export TZ=America/Bogota

WORK="/tmp/sync_movimientos_materiales"
LOG="/var/log/sync-movimientos-materiales.log"

mkdir -p "$WORK"

exec >>"$LOG" 2>&1

echo
echo "======================================================"
echo "INICIO SYNC MOVIMIENTOS: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================"

OC=$(docker ps --format '{{.Names}}' | grep -i openclaw | head -1)
PG=$(docker ps --format '{{.Names}}' | grep '^postgres_postgres' | head -1)

if [ -z "$OC" ]; then
    echo "ERROR: OpenClaw no encontrado"
    exit 1
fi

if [ -z "$PG" ]; then
    echo "ERROR: PostgreSQL no encontrado"
    exit 1
fi

FI_DMY=$(date -d '7 days ago' '+%d/%m/%Y')
FF_DMY=$(date '+%d/%m/%Y')

FI_ISO=$(date -d '7 days ago' '+%Y-%m-%d')
FF_ISO=$(date '+%Y-%m-%d')
# Rango opcional para rellenos: DESDE=AAAA-MM-DD HASTA=AAAA-MM-DD (sin variables = últimos 7 días)
if [ -n "${DESDE:-}" ] && [ -n "${HASTA:-}" ]; then
    FI_DMY=$(date -d "$DESDE" '+%d/%m/%Y'); FF_DMY=$(date -d "$HASTA" '+%d/%m/%Y')
    FI_ISO=$(date -d "$DESDE" '+%Y-%m-%d'); FF_ISO=$(date -d "$HASTA" '+%Y-%m-%d')
fi

echo "OpenClaw : $OC"
echo "Postgres : $PG"
echo "Periodo  : $FI_DMY -> $FF_DMY"

echo
echo "=== 1. DESCARGANDO CRISOLWEB ==="

docker exec -i "$OC" sh -lc "
cd /home/node/.openclaw/workspace
FI='$FI_DMY' FF='$FF_DMY' timeout -k 10 300 node fetch-movimientos-v2.mjs
"

CSV_OC="/home/node/.openclaw/workspace/tmp_crisol_movimientos/movimientos_todos_materiales_${FI_ISO}_${FF_ISO}.csv"

docker exec "$OC" test -s "$CSV_OC"

echo
echo "=== 2. LIMPIANDO FINAL CSV ==="

docker exec "$OC" \
perl -0777 -i -pe 's/(?:\r?\n)+\z/\r\n/' "$CSV_OC"

CSV_HOST="$WORK/movimientos_${FI_ISO}_${FF_ISO}.csv"

docker cp "$OC:$CSV_OC" "$CSV_HOST"
docker cp "$CSV_HOST" "$PG":/tmp/movimientos_sync.csv

echo
echo "=== 3. ACTUALIZANDO POSTGRES ==="

docker exec -i "$PG" \
psql \
-U probolsas_user \
-d probolsas_db \
-v ON_ERROR_STOP=1 \
-v fi="$FI_ISO" \
-v ff="$FF_ISO" \
-P pager=off <<'SQL'

BEGIN;

CREATE TEMP TABLE stg_movimientos (
    consecutivo text,
    fecha text,
    fecha_contable text,
    material text,
    tipo_movimiento text,
    concepto text,
    entradas text,
    salida text,
    precio text,
    valor_total text,
    lote text,
    origen text,
    documento text,
    tercero text,
    bodega text
);

CREATE TEMP TABLE sync_parametros (
    fi date NOT NULL,
    ff date NOT NULL
);

INSERT INTO sync_parametros
VALUES (:'fi'::date, :'ff'::date);

\copy stg_movimientos FROM '/tmp/movimientos_sync.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

DO $$
DECLARE
    n integer;
    fuera integer;
BEGIN
    SELECT COUNT(*)
    INTO n
    FROM stg_movimientos;

    IF n = 0 THEN
        RAISE EXCEPTION 'CSV llegó con 0 movimientos. Se aborta para proteger datos existentes.';
    END IF;

    SELECT COUNT(*)
    INTO fuera
    FROM stg_movimientos s
    CROSS JOIN sync_parametros p
    WHERE TO_DATE(BTRIM(s.fecha),'DD/MM/YYYY') < p.fi
       OR TO_DATE(BTRIM(s.fecha),'DD/MM/YYYY') > p.ff;

    IF fuera <> 0 THEN
        RAISE EXCEPTION 'Hay % movimientos fuera del rango solicitado', fuera;
    END IF;

    RAISE NOTICE 'STAGING OK: % movimientos', n;
END $$;

DELETE FROM crisolweb.movimientos_materiales m
USING sync_parametros p
WHERE m.fecha BETWEEN p.fi AND p.ff;

INSERT INTO crisolweb.movimientos_materiales (
    consecutivo,
    fecha,
    fecha_contable,
    material,
    tipo_movimiento,
    concepto,
    entradas,
    salida,
    precio,
    valor_total,
    lote,
    origen,
    documento,
    tercero,
    bodega,
    _fuente,
    _sync_origen
)
SELECT
    NULLIF(BTRIM(consecutivo),''),
    TO_DATE(BTRIM(fecha),'DD/MM/YYYY'),

    CASE
        WHEN NULLIF(BTRIM(fecha_contable),'') IS NULL THEN NULL
        ELSE TO_DATE(BTRIM(fecha_contable),'DD/MM/YYYY')
    END,

    NULLIF(BTRIM(material),''),
    NULLIF(BTRIM(tipo_movimiento),''),
    NULLIF(BTRIM(concepto),''),

    NULLIF(REPLACE(BTRIM(entradas),',',''),'')::numeric,
    NULLIF(REPLACE(BTRIM(salida),',',''),'')::numeric,
    NULLIF(REPLACE(BTRIM(precio),',',''),'')::numeric,
    NULLIF(REPLACE(BTRIM(valor_total),',',''),'')::numeric,

    NULLIF(BTRIM(lote),''),
    NULLIF(BTRIM(origen),''),
    NULLIF(BTRIM(documento),''),
    NULLIF(BTRIM(tercero),''),
    NULLIF(BTRIM(bodega),''),

    'crisolweb',

    'cron_d7_' || (
        SELECT TO_CHAR(ff,'YYYY-MM-DD')
        FROM sync_parametros
    )

FROM stg_movimientos;

DO $$
DECLARE
    staging_count integer;
    db_count integer;
BEGIN
    SELECT COUNT(*)
    INTO staging_count
    FROM stg_movimientos;

    SELECT COUNT(*)
    INTO db_count
    FROM crisolweb.movimientos_materiales m
    CROSS JOIN sync_parametros p
    WHERE m.fecha BETWEEN p.fi AND p.ff;

    IF staging_count <> db_count THEN
        RAISE EXCEPTION
        'Validación falló. Staging=% PostgreSQL=%',
        staging_count,
        db_count;
    END IF;

    RAISE NOTICE
    'RANGO D-7 VALIDADO: % movimientos',
    db_count;
END $$;

COMMIT;

SELECT
    COUNT(*) AS total_tabla,
    MIN(fecha) AS desde,
    MAX(fecha) AS hasta
FROM crisolweb.movimientos_materiales;

SQL

echo
echo "SYNC COMPLETADO OK: $(date '+%Y-%m-%d %H:%M:%S')"
