# Cliente mínimo de la API OFICIAL de SIIGO (solo librería estándar, compatible con Python 3.8).
# Credenciales: /opt/probolsas/conciliacion/.env (SIIGO_USER, SIIGO_API_ACCESS_KEY, SIIGO_PARTNER_ID).
import json, io, zipfile, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from decimal import Decimal
ENV_FILE = '/opt/probolsas/conciliacion/.env'
_M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def _env():
    d = {}
    for l in open(ENV_FILE, encoding='utf-8'):
        if '=' in l and not l.lstrip().startswith('#'):
            k, v = l.split('=', 1)
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d

def _post(url, body, headers):
    h = {'Content-Type': 'application/json'}; h.update(headers)
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method='POST')
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())

def _num(s):
    try:
        return Decimal(s) if s else Decimal('0')
    except Exception:
        return Decimal('0')

def _leer(xlsx):
    z = zipfile.ZipFile(io.BytesIO(xlsx))
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(_M + 'si'):
            ss.append(''.join(t.text or '' for t in si.iter(_M + 't')))
    filas = []
    for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(_M + 'row'):
        f = {}
        for i, c in enumerate(r.iter(_M + 'c')):
            x = c.find(_M + 'v'); t = c.get('t')
            if t == 's' and x is not None: val = ss[int(x.text)]
            elif t == 'inlineStr': val = ''.join(y.text or '' for y in c.iter(_M + 't'))
            else: val = x.text if x is not None else ''
            ref = c.get('r')
            f[''.join(ch for ch in ref if ch.isalpha()) if ref else str(i)] = (val or '').strip()
        filas.append(f)
    enc = next((f for f in filas if 'Código cuenta contable' in f.values() and 'Saldo final' in f.values()), None)
    if not enc:
        raise ValueError('el Excel no trae los encabezados esperados (¿cambió el formato del reporte?)')
    C = {v: k for k, v in enc.items()}
    g = lambda f, col: f.get(C.get(col), '')
    out = []
    for f in filas:
        cod = g(f, 'Código cuenta contable')
        if not cod.isdigit():
            continue
        out.append({'nivel': g(f, 'Nivel'), 'transaccional': g(f, 'Transaccional').lower() in ('sí', 'si'),
                    'codigo': cod, 'nombre': g(f, 'Nombre Cuenta contable'),
                    'saldo_inicial': _num(g(f, 'Saldo Inicial')), 'debito': _num(g(f, 'Movimiento Débito')),
                    'credito': _num(g(f, 'Movimiento Crédito')), 'saldo_final': _num(g(f, 'Saldo final'))})
    return out

class Siigo:
    def __init__(self):
        e = _env()
        self.p = e.get('SIIGO_PARTNER_ID', '')
        self.tok = _post('https://api.siigo.com/auth',
                         {'username': e['SIIGO_USER'], 'access_key': e['SIIGO_API_ACCESS_KEY']},
                         {'Partner-Id': self.p})['access_token']

    def balance(self, anio, mes_ini, mes_fin=None):
        """Balance de prueba de un mes (o rango de meses): una fila por cuenta, todos los niveles."""
        rep = _post('https://api.siigo.com/v1/test-balance-report',
                    {'year': anio, 'month_start': mes_ini, 'month_end': mes_fin or mes_ini, 'includes_tax_difference': False},
                    {'Partner-Id': self.p, 'Authorization': 'Bearer ' + self.tok})
        with urllib.request.urlopen(urllib.parse.quote(rep['file_url'], safe=':/?=&%'), timeout=180) as r:
            return _leer(r.read())
