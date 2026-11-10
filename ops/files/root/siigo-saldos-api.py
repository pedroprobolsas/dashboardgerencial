#!/usr/bin/env python3
# Saldos de caja, bancos y fiducias desde la API OFICIAL de SIIGO (sin navegador ni código SMS).
# Fuente: balance de prueba del mes en curso (POST /v1/test-balance-report), "Saldo final" de las cuentas auxiliares.
# Destino: app_ops.saldos_cuentas_diarios (una fila por cuenta y día; si se corre dos veces el mismo día, actualiza).
# Credenciales: /opt/probolsas/conciliacion/.env (SIIGO_USER, SIIGO_API_ACCESS_KEY, SIIGO_PARTNER_ID).
# Uso: siigo-saldos-api.py           -> carga
#      siigo-saldos-api.py --prueba  -> solo muestra lo que cargaría
import sys, json, io, zipfile, subprocess, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal
from datetime import timezone, timedelta  # Colombia: UTC-5 fijo, sin horario de verano

PREFIJOS = ('1105', '1110', '1125')   # caja, bancos, fiducias
ENV_FILE = '/opt/probolsas/conciliacion/.env'
PRUEBA = '--prueba' in sys.argv

def falla(msg):
    print('❌ ' + msg)
    if not PRUEBA:
        subprocess.run(['/root/send-telegram.sh', '❌ Saldos SIIGO (API): ' + msg])
    sys.exit(1)

def leer_env():
    d = {}
    for l in open(ENV_FILE, encoding='utf-8'):
        if '=' in l and not l.lstrip().startswith('#'):
            k, v = l.split('=', 1)
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d

def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', **headers}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

e = leer_env()
P = e.get('SIIGO_PARTNER_ID', '')
try:
    tok = post('https://api.siigo.com/auth',
               {'username': e['SIIGO_USER'], 'access_key': e['SIIGO_API_ACCESS_KEY']}, {'Partner-Id': P})['access_token']
except Exception as x:
    falla(f'no se pudo autenticar con la API ({x})')

hoy = datetime.now(timezone(timedelta(hours=-5))).date()
try:
    rep = post('https://api.siigo.com/v1/test-balance-report',
               {'year': hoy.year, 'month_start': hoy.month, 'month_end': hoy.month, 'includes_tax_difference': False},
               {'Partner-Id': P, 'Authorization': 'Bearer ' + tok})
    with urllib.request.urlopen(urllib.parse.quote(rep['file_url'], safe=':/?=&%'), timeout=120) as r:
        xlsx = r.read()
except Exception as x:
    falla(f'no se pudo generar o descargar el balance de prueba ({x})')

# Leer el Excel por posición de columna (letra), sin librerías externas
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(io.BytesIO(xlsx))
ss = []
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(M + 'si'):
        ss.append(''.join(t.text or '' for t in si.iter(M + 't')))
filas = []
for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(M + 'row'):
    f = {}
    for i, c in enumerate(r.iter(M + 'c')):
        x = c.find(M + 'v'); t = c.get('t')
        if t == 's' and x is not None: val = ss[int(x.text)]
        elif t == 'inlineStr': val = ''.join(y.text or '' for y in c.iter(M + 't'))
        else: val = x.text if x is not None else ''
        ref = c.get('r')
        f[''.join(ch for ch in ref if ch.isalpha()) if ref else str(i)] = (val or '').strip()
    filas.append(f)

enc = next((f for f in filas if 'Código cuenta contable' in f.values() and 'Saldo final' in f.values()), None)
if not enc:
    falla('el Excel no trae los encabezados esperados (¿cambió el formato del reporte?)')
C = {v: k for k, v in enc.items()}
COD, NOM, SAL, TRA = C['Código cuenta contable'], C['Nombre Cuenta contable'], C['Saldo final'], C.get('Transaccional')

cuentas = []
for f in filas:
    cod = f.get(COD, '')
    if cod.startswith(PREFIJOS) and f.get(TRA, '').lower() in ('sí', 'si'):
        cuentas.append((cod, f.get(NOM, ''), Decimal(f.get(SAL) or '0')))
if not cuentas:
    falla('el balance no trajo cuentas de caja, bancos o fiducia')

print(f'Saldos al {hoy} — {len(cuentas)} cuentas:')
for c, n, s in cuentas:
    print(f'  {c}  {n[:42]:42}  {s:>18,.2f}')
if PRUEBA:
    print('(modo prueba: no se escribió nada)')
    sys.exit(0)

def lit(s): return "'" + s.replace("'", "''") + "'"
valores = ',\n'.join(f"({lit(str(hoy))}, {lit(c)}, {lit(n)}, {s})" for c, n, s in cuentas)
sql = f"""BEGIN;
INSERT INTO app_ops.saldos_cuentas_diarios (fecha, codigo_cuenta, nombre_cuenta, saldo) VALUES
{valores}
ON CONFLICT (fecha, codigo_cuenta) DO UPDATE
  SET nombre_cuenta = EXCLUDED.nombre_cuenta, saldo = EXCLUDED.saldo, creado_en = now();
COMMIT;
"""
pg = subprocess.run(['docker', 'ps', '--filter', 'name=postgres', '-q'], capture_output=True, text=True).stdout.split()
if not pg:
    falla('contenedor de Postgres no encontrado')
r = subprocess.run(['docker', 'exec', '-i', pg[0], 'psql', '-v', 'ON_ERROR_STOP=1', '-q',
                    '-U', 'probolsas_user', '-d', 'probolsas_db'], input=sql, capture_output=True, text=True)
if r.returncode != 0:
    falla('no se pudo guardar en Postgres: ' + ((r.stderr.strip().splitlines() or ['sin detalle'])[0]))
print(f'✅ {len(cuentas)} saldos guardados con fecha {hoy}')
