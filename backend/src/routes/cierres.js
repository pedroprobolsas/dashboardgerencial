'use strict';
const express = require('express');
const router = express.Router();
const { appendRow, updateRowById } = require('../sheetsClient');
const { SCHEMAS } = require('./setup');

const SP1 = process.env.SPREADSHEET_ID_1;
const SP2 = process.env.SPREADSHEET_ID_2;

// ── Utilidades para pre-llenado ───────────────────────────────────────────────
const MESES_PREFILL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parseCOPL(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

// Mapeo: área del formulario → nombre de la pestaña en Sheets
const AREA_A_HOJA = {
  Ventas:        'Cierre_Ventas',
  Finanzas:      'Cierre_Finanzas',
  Produccion:    'Cierre_Produccion',
  Cartera:       'Cierre_Cartera',
  TalentoHumano: 'Cierre_TalentoHumano',
};

// Columna de Estado en cada hoja (letra, 1-indexed A=col1)
// Se determina dinámicamente desde SCHEMAS — Estado es siempre la 7ª columna (G)
// Se infiere a partir del índice en el array de headers
function colLetra(index) {
  // A=0, B=1 ... Z=25, AA=26 ...
  let result = '';
  let i = index;
  do {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return result;
}

function indiceColumna(sheetName, colName) {
  const headers = SCHEMAS[sheetName];
  return headers ? headers.indexOf(colName) : -1;
}

// ── POST /api/cierres/:area ───────────────────────────────────────────────────
// Recibe los datos del formulario y los escribe en el Sheet correspondiente.
// Retorna el ID_Registro generado para que el frontend lo use en PATCH.

router.post('/:area', async (req, res) => {
  const { area } = req.params;
  const sheetName = AREA_A_HOJA[area];

  if (!sheetName) {
    return res.status(400).json({ error: `Área desconocida: ${area}` });
  }

  const datos = req.body; // campos del formulario enviados por el frontend
  const headers = SCHEMAS[sheetName];

  if (!headers) {
    return res.status(500).json({ error: `No hay schema definido para ${sheetName}` });
  }

  // Campos automáticos del sistema
  const idRegistro = `CI-${Date.now()}`;
  const periodo = datos.periodo || '';
  const [anio, mes] = periodo.split('-').map(Number);
  const ahora = new Date().toISOString();

  // Construye la fila en el orden exacto del schema
  // Los campos del formulario usan snake_case igual que el schema pero en minúscula
  const fila = headers.map(col => {
    switch (col) {
      case 'ID_Registro':     return idRegistro;
      case 'Período':         return periodo;
      case 'Año':             return anio || '';
      case 'Mes':             return mes  || '';
      case 'Responsable':     return 'Pedro Sandoval'; // se reemplaza con OAuth en Fase 1
      case 'Fecha_Envio':     return ahora;
      case 'Estado':          return 'ENVIADO';
      // Campos que calcula el sistema a partir de los datos del líder
      case 'Utilidad_Bruta':
        return (Number(datos.total_ingresos || 0) - Number(datos.total_egresos || 0)).toString();
      case 'Variacion_Vs_Mes_Anterior': return ''; // calculado posterior — requiere mes anterior
      // Campos que rellena la gerencia — vacíos al crear
      case 'Comentario_Gerencia': return '';
      case 'Fecha_Aprobacion':    return '';
      // Resto: busca en los datos del formulario por nombre de columna en minúscula
      default: return datos[col.toLowerCase()] ?? datos[col] ?? '';
    }
  });

  const filaResumen = [idRegistro, periodo, area, 'Pedro Sandoval', ahora, 'ENVIADO', '', ''];

  try {
    await appendRow(SP1, sheetName, fila);
    try {
      await appendRow(SP1, 'Informes_cierre_mensual', filaResumen);
    } catch (e) {
      console.error('Error escribiendo Informes_cierre_mensual:', e.message);
    }
    res.json({ ok: true, id_registro: idRegistro, periodo, area, sheet: sheetName });
  } catch (err) {
    console.error(`POST /api/cierres/${area} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/cierres/:area/:idRegistro/estado ───────────────────────────────
// Actualiza Estado, Comentario_Gerencia y Fecha_Aprobacion en la fila del informe.

router.patch('/:area/:idRegistro/estado', async (req, res) => {
  const { area, idRegistro } = req.params;
  const { estado, comentario_gerencia } = req.body;
  const sheetName = AREA_A_HOJA[area];

  if (!sheetName) {
    return res.status(400).json({ error: `Área desconocida: ${area}` });
  }

  const estadosValidos = ['APROBADO', 'RECHAZADO'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido: ${estado}. Usa APROBADO o RECHAZADO.` });
  }
  if (estado === 'RECHAZADO' && !comentario_gerencia?.trim()) {
    return res.status(400).json({ error: 'Comentario_Gerencia es obligatorio al rechazar.' });
  }

  const headers = SCHEMAS[sheetName];
  const iEstado     = indiceColumna(sheetName, 'Estado');
  const iComentario = indiceColumna(sheetName, 'Comentario_Gerencia');
  const iFecha      = indiceColumna(sheetName, 'Fecha_Aprobacion');

  const cambios = {
    [colLetra(iEstado)]:     estado,
    [colLetra(iComentario)]: comentario_gerencia || '',
    [colLetra(iFecha)]:      new Date().toISOString(),
  };

  // Columnas de Informes_cierre_mensual: F=Estado, G=Comentario_Gerencia, H=Fecha_Aprobacion
  const cambiosResumen = { F: estado, G: comentario_gerencia || '', H: new Date().toISOString() };

  try {
    await updateRowById(SP1, sheetName, idRegistro, cambios);
    try {
      await updateRowById(SP1, 'Informes_cierre_mensual', idRegistro, cambiosResumen);
    } catch (e) {
      console.error('Error actualizando Informes_cierre_mensual:', e.message);
    }
    res.json({ ok: true, id_registro: idRegistro, estado, sheet: sheetName });
  } catch (err) {
    console.error(`PATCH /api/cierres/${area}/${idRegistro}/estado error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cierres/prefill/:area ───────────────────────────────────────────
// Devuelve los valores del sistema para pre-llenar el formulario de cierre.

router.get('/prefill/:area', async (req, res) => {
  const { area } = req.params;
  const periodo = req.query.periodo || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const [y, m] = periodo.split('-').map(Number);
  const mesLabel = MESES_PREFILL[m - 1];
  const anioStr  = String(y);
  const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const { readRange } = require('../sheetsClient');

  try {
    let campos = {};

    // ── Ventas ────────────────────────────────────────────────────────────────
    if (area === 'Ventas') {
      const [filasVentas, filasMetas] = await Promise.all([
        readRange(SP1, 'Facturacion_OP!A:AZ'),
        readRange(SP1, 'Metas_Gerencia!A:G'),
      ]);

      const hV = filasVentas[0] || [];
      const iValor = hV.indexOf('ValorFacturado');
      const iMes   = hV.indexOf('MES');

      const filasMes = (iValor !== -1 && iMes !== -1)
        ? filasVentas.slice(1).filter(f => (f[iMes] || '').toString().toLowerCase().trim() === mesLabel)
        : [];

      const totalVentas = filasMes.reduce((s, f) => s + parseCOPL(f[iValor]), 0);
      const numFacturas = filasMes.length;

      // Meta desde Sheets con fallback a ENV
      let metaVentas = parseFloat(process.env.META_VENTAS || '200000000');
      if (filasMetas.length > 1) {
        const hM = filasMetas[0];
        const iKPI = hM.indexOf('KPI'), iMeta = hM.indexOf('Meta'), iActivo = hM.indexOf('Activo');
        const filaM = filasMetas.slice(1).find(f =>
          (f[iActivo] || '').toString().trim().toUpperCase() === 'SI' &&
          (f[iKPI]    || '').toString().trim() === 'ventas_mes'
        );
        if (filaM) {
          const v = parseFloat(String(filaM[iMeta]).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
          if (!isNaN(v) && v > 0) metaVentas = v;
        }
      }

      const pctMeta = metaVentas > 0 ? Math.round(totalVentas / metaVentas * 10) / 10 : 0;

      campos = {
        total_ventas_mes:      { valor: Math.round(totalVentas), etiqueta: fmt.format(totalVentas) },
        num_facturas:          { valor: numFacturas,              etiqueta: String(numFacturas) },
        pct_cumplimiento_meta: { valor: pctMeta,                  etiqueta: `${pctMeta}%` },
      };

    // ── Finanzas ──────────────────────────────────────────────────────────────
    } else if (area === 'Finanzas') {
      const [filasIngr, filasEgr] = await Promise.all([
        readRange(SP1, 'LISTADO_DE_INGRESOS!A:AZ'),
        readRange(SP2, 'Consecutivo_de_egresos!A:AZ'),
      ]);

      const hI = filasIngr[0] || [];
      const iVal = hI.indexOf('ValorRecibido'), iMesI = hI.indexOf('Mes');
      const iAnioI = hI.indexOf('Año'), iIngLiq = hI.indexOf('IngresoLiquidacion');

      const ingresos = (iVal !== -1 && iMesI !== -1)
        ? filasIngr.slice(1).filter(f => {
            if ((f[iMesI] || '').toString().toLowerCase().trim() !== mesLabel) return false;
            if (iAnioI !== -1 && (f[iAnioI] || '').toString().trim() !== anioStr) return false;
            return (iIngLiq !== -1 ? (f[iIngLiq] || '').toString().trim() : '') === '';
          }).reduce((s, f) => s + parseCOPL(f[iVal]), 0)
        : 0;

      const hE = filasEgr[0] || [];
      const iNeto = hE.indexOf('NetoPagar2'), iMesE = hE.indexOf('Mes');
      const iAnioE = hE.indexOf('Año'), iEgrLiq = hE.indexOf('EgresoLiquidacion');
      const iMedioPago = hE.indexOf('MedioPago1');

      const egresos = (iNeto !== -1 && iMesE !== -1)
        ? filasEgr.slice(1).filter(f => {
            if ((f[iMesE] || '').toString().toLowerCase().trim() !== mesLabel) return false;
            if (iAnioE !== -1 && (f[iAnioE] || '').toString().trim() !== anioStr) return false;
            if (iEgrLiq !== -1 && (f[iEgrLiq] || '').toString().trim() !== 'Base Exenta') return false;
            if (iMedioPago !== -1 && (f[iMedioPago] || '').toString().toUpperCase().includes('CRUCE')) return false;
            return true;
          }).reduce((s, f) => s + parseCOPL(f[iNeto]), 0)
        : 0;

      const flujo = ingresos - egresos;
      campos = {
        total_ingresos:        { valor: Math.round(ingresos), etiqueta: fmt.format(ingresos) },
        total_egresos:         { valor: Math.round(egresos),  etiqueta: fmt.format(egresos) },
        flujo_caja_disponible: { valor: Math.round(flujo),    etiqueta: fmt.format(flujo) },
      };

    // ── Cartera ───────────────────────────────────────────────────────────────
    } else if (area === 'Cartera') {
      const filas = await readRange(SP2, 'CarteraPorPagarDetalladaPorTercero!A:AZ');
      const h = filas[0] || [];
      const iSaldo     = h.indexOf('Saldo');
      const iDias      = h.indexOf('DiasVencidos');
      const iPorVencer = h.indexOf('Por vencer');

      if (iSaldo !== -1 && iDias !== -1 && filas.length > 1) {
        const vencidas = filas.slice(1).filter(f =>
          f[iSaldo] && String(f[iSaldo]).trim() !== '' && parseInt(f[iDias] || '0', 10) < 0
        );
        const carteraVencida = vencidas.reduce((s, f) => s + parseCOPL(f[iSaldo]), 0);

        // Vigente: usa columna "Por vencer" si existe; fallback a DiasVencidos >= 0
        let carteraVigente = 0;
        if (iPorVencer !== -1) {
          carteraVigente = filas.slice(1).reduce((s, f) => s + parseCOPL(f[iPorVencer]), 0);
        } else {
          const vigentes = filas.slice(1).filter(f =>
            f[iSaldo] && String(f[iSaldo]).trim() !== '' && parseInt(f[iDias] || '0', 10) >= 0
          );
          carteraVigente = vigentes.reduce((s, f) => s + parseCOPL(f[iSaldo]), 0);
        }

        campos = {
          cartera_vencida: { valor: Math.round(carteraVencida), etiqueta: fmt.format(carteraVencida) },
          cartera_vigente: { valor: Math.round(carteraVigente), etiqueta: fmt.format(carteraVigente) },
        };
      }

    // ── Producción ────────────────────────────────────────────────────────────
    } else if (area === 'Produccion') {
      const filas = await readRange(SP1, 'Costo_por Orden!A:AZ');
      const h = filas[0] || [];
      const iFechaFin = h.indexOf('FechaFinOP');
      const iEstim    = h.indexOf('CostoTotalEstimado');
      const iEjec     = h.indexOf('CostoTotalEjecutado1');
      const iValor    = h.indexOf('ValorCumplido');
      const iCant     = h.indexOf('CantidadCumplida');

      if (iFechaFin !== -1 && filas.length > 1) {
        const datos = filas.slice(1).filter(f => {
          const mtch = String(f[iFechaFin] || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return mtch && parseInt(mtch[2], 10) === m && parseInt(mtch[3], 10) === y;
        });
        const ordenes    = datos.length;
        const sumEstim   = iEstim  !== -1 ? datos.reduce((s, f) => s + parseCOPL(f[iEstim]),  0) : 0;
        const sumEjec    = iEjec   !== -1 ? datos.reduce((s, f) => s + parseCOPL(f[iEjec]),   0) : 0;
        const sumValor   = iValor  !== -1 ? datos.reduce((s, f) => s + parseCOPL(f[iValor]),  0) : 0;
        const sumCant    = iCant   !== -1 ? datos.reduce((s, f) => s + parseCOPL(f[iCant]),   0) : ordenes;
        const eficiencia = sumEjec > 0 ? Math.round(sumEstim / sumEjec * 1000) / 10 : 0;

        campos = {
          unidades_producidas:           { valor: Math.round(sumCant),   etiqueta: String(Math.round(sumCant)) },
          pct_eficiencia_maquinas:       { valor: eficiencia,             etiqueta: `${eficiencia}%` },
          inventario_producto_terminado: { valor: Math.round(sumValor),   etiqueta: fmt.format(sumValor) },
        };
      }
    }

    res.json({ ok: true, periodo, area, campos });
  } catch (err) {
    console.error(`prefill/${area}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cierres/bandeja ──────────────────────────────────────────────────
// Lee todos los informes de Informes_cierre_mensual para la Bandeja de Aprobación.

router.get('/bandeja', async (req, res) => {
  const { readRange } = require('../sheetsClient');
  try {
    const filas = await readRange(SP1, 'Informes_cierre_mensual!A:H');
    if (filas.length <= 1) return res.json({ informes: [] });
    const headers = filas[0];
    const informes = filas.slice(1).map(fila => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = fila[i] ?? ''; });
      return obj;
    });
    res.json({ informes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cierres/:area ────────────────────────────────────────────────────
// Lee todos los informes de un área para mostrar en Bandeja.

router.get('/:area', async (req, res) => {
  const { area } = req.params;
  const sheetName = AREA_A_HOJA[area];
  if (!sheetName) return res.status(400).json({ error: `Área desconocida: ${area}` });

  const { readRange } = require('../sheetsClient');
  try {
    const filas = await readRange(SP1, `${sheetName}!A:Z`);
    if (filas.length <= 1) return res.json({ area, informes: [] });

    const headers = filas[0];
    const informes = filas.slice(1).map(fila => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = fila[i] ?? ''; });
      return obj;
    });
    res.json({ area, informes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
