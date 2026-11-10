#!/usr/bin/env python3
# Contabilidad mensual desde la API OFICIAL de SIIGO (balance de prueba): UNA consulta por mes alimenta:
#   1) Finanzas -> app_ops.saldos_contables_siigo (clases 1, 2, 5, 6; una foto por mes)
#   2) Costos   -> app_ops.siigo_costos_produccion_resumen (72 mano de obra, 73 otros, estado del mes)
#                  app_ops.siigo_costos_produccion_detalle (débitos del mes por cuenta 72/73)
# Reemplaza a siigo-saldos-contables-sync.js y siigo-costos-produccion-sync.js (login web, rotos por el código SMS).
# Uso:
#   siigo-contable-api.py                  -> mes anterior + mes en curso (corrida diaria)
#   siigo-contable-api.py --desde 2026-01  -> relleno desde ese mes
#   agregar --prueba para mostrar totales sin escribir
import sys, subprocess, calendar
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
sys.path.insert(0, '/root')
from siigo_api import Siigo

PRUEBA = '--prueba' in sys.argv
CLASES = ('1', '2', '5', '6')

def falla(msg):
    print('❌ ' + msg)
    if not PRUEBA:
        subprocess.run(['/root/send-telegram.sh', '❌ Contabilidad SIIGO (API): ' + msg])
    sys.exit(1)

hoy = datetime.now(timezone(timedelta(hours=-5))).date()
if '--desde' in sys.argv:
    a, m = map(int, sys.argv[sys.argv.index('--desde') + 1].split('-'))
else:
    a, m = (hoy.year, hoy.month - 1) if hoy.month > 1 else (hoy.year - 1, 12)
meses = []
while (a, m) <= (hoy.year, hoy.month):
    meses.append((a, m))
    m += 1
    if m == 13:
        a, m = a + 1, 1

try:
    s = Siigo()
except Exception as x:
    falla(f'no se pudo autenticar con la API ({x})')

def lit(v): return "'" + str(v).replace("'", "''") + "'"
CERO = Decimal(0)
sql = []
for a, m in meses:
    ultimo = date(a, m, calendar.monthrange(a, m)[1])
    actual = (a, m) == (hoy.year, hoy.month)
    fecha = hoy if actual else ultimo
    try:
        aux = [r for r in s.balance(a, m) if r['transaccional']]
    except Exception as x:
        falla(f'no se pudo obtener el balance de {a}-{m:02d} ({x})')
    fin = [r for r in aux if r['codigo'][0] in CLASES]
    cos = [r for r in aux if r['codigo'][:2] in ('72', '73')]
    if not fin:
        falla(f'el balance de {a}-{m:02d} no trajo cuentas de Finanzas')
    d72 = sum((r['debito'] for r in cos if r['codigo'].startswith('72')), CERO)
    d73 = sum((r['debito'] for r in cos if r['codigo'].startswith('73')), CERO)
    cred = sum((r['credito'] for r in cos), CERO)
    if actual:
        estado = 'parcial'
    elif d72 + d73 > 0 and cred >= (d72 + d73) * Decimal('0.5'):
        estado = 'cerrado'
    else:
        estado = 'pendiente'
    tot = ' '.join(f"c{c}:{sum((r['saldo_final'] for r in fin if r['codigo'][0] == c), CERO):>15,.0f}" for c in CLASES)
    print(f'{a}-{m:02d} → {fecha} · {len(fin):>3} ctas · {tot} · 72:{d72:>12,.0f} · 73:{d73:>12,.0f} · cierre {(cred / (d72 + d73) if d72 + d73 else 0):.0%} · {estado}')

    # 1) Finanzas: reemplaza la foto del mes
    vals = ',\n'.join(f"({lit(fecha)}, {lit(r['codigo'])}, {lit(r['nombre'])}, {r['codigo'][0]}, {r['saldo_inicial']}, "
                      f"{r['debito']}, {r['credito']}, {r['saldo_final']}, 'api_balance')" for r in fin)
    sql.append(f"DELETE FROM app_ops.saldos_contables_siigo WHERE fecha BETWEEN {lit(date(a, m, 1))} AND {lit(ultimo)};")
    sql.append("INSERT INTO app_ops.saldos_contables_siigo (fecha, codigo_cuenta, nombre_cuenta, clase, saldo_inicial, "
               f"movimiento_debito, movimiento_credito, saldo_final, fuente_reporte) VALUES\n{vals};")
    # 2) Costos: resumen del mes
    sql.append("INSERT INTO app_ops.siigo_costos_produccion_resumen (anio, mes, costos_mano_obra_72, costos_otros_73, "
               "cantidad_movimientos_72, cantidad_movimientos_73, lineas_cierre_excluidas, comprobantes_cierre, estado_mes, "
               f"fecha_extraccion, fecha_actualizacion, script_version) VALUES ({a}, {m}, {d72}, {d73}, 0, 0, 0, NULL, "
               f"{lit(estado)}, now(), now(), 'api-3.0') ON CONFLICT (anio, mes) DO UPDATE SET "
               "costos_mano_obra_72 = EXCLUDED.costos_mano_obra_72, costos_otros_73 = EXCLUDED.costos_otros_73, "
               "cantidad_movimientos_72 = 0, cantidad_movimientos_73 = 0, lineas_cierre_excluidas = 0, comprobantes_cierre = NULL, "
               "estado_mes = EXCLUDED.estado_mes, fecha_actualizacion = now(), script_version = EXCLUDED.script_version;")
    # 2) Costos: detalle = débitos del mes por cuenta (lo que suma Análisis de Materiales)
    sql.append(f"DELETE FROM app_ops.siigo_costos_produccion_detalle WHERE anio = {a} AND mes = {m};")
    filas = [r for r in cos if r['debito'] != 0]
    if filas:
        dv = ',\n'.join(f"({a}, {m}, {lit(r['codigo'])}, {lit(r['nombre'])}, 'BALANCE-API', 0, {lit(fecha)}, "
                        f"'Débitos del mes según balance de prueba (API oficial SIIGO)', {r['debito']}, 0, false)" for r in filas)
        sql.append("INSERT INTO app_ops.siigo_costos_produccion_detalle (anio, mes, accounting_code, accounting_concept, voucher, "
                   f"sequence, elaboration_date, description, debit, credit, es_cierre) VALUES\n{dv};")

if PRUEBA:
    print('(modo prueba: no se escribió nada)')
    sys.exit(0)

pg = subprocess.run(['docker', 'ps', '--filter', 'name=postgres', '-q'], capture_output=True, text=True).stdout.split()
if not pg:
    falla('contenedor de Postgres no encontrado')
r = subprocess.run(['docker', 'exec', '-i', pg[0], 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'probolsas_db'],
                   input='BEGIN;\n' + '\n'.join(sql) + '\nCOMMIT;\n', capture_output=True, text=True)
if r.returncode != 0:
    falla('no se pudo guardar en Postgres: ' + ((r.stderr.strip().splitlines() or ['sin detalle'])[0]))
print(f'✅ Contabilidad SIIGO actualizada: {len(meses)} mes(es)')
