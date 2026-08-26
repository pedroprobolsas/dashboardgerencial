const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const { query } = require('../dbClient');
const { loadParametrosFromDB } = require('./kpis');

async function kpiCumplimientoCantidad(anio, mesNum, liderNombre) {
  const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
  const paramsBD = await loadParametrosFromDB(primerDiaMes);
  
  const sql = `
    SELECT
      nro_orden,
      cantidad_pedida,
      cantidad_cumplida,
      (cantidad_cumplida / cantidad_pedida) AS ratio
    FROM crisolweb.ordenes_cumplidas
    WHERE fecha_cumplimiento >= $1::date
      AND fecha_cumplimiento < ($1::date + INTERVAL '1 month')
      AND cantidad_pedida > 0
  `;
  
  const { rows } = await query(sql, [primerDiaMes]);

  const margen = (paramsBD.kpi_cumplimiento_margen || 0) / 100;
  const incentivoPositivo = paramsBD.kpi_cumplimiento_incentivo_positivo || 0;
  const incentivoNegativo = paramsBD.kpi_cumplimiento_incentivo_negativo || 0;

  const minRatio = 1 - margen;
  const maxRatio = 1 + margen;

  let opsDentro = 0;
  let opsFuera = 0;

  for (const row of rows) {
    const ratio = parseFloat(row.ratio);
    if (ratio >= minRatio && ratio <= maxRatio) {
      opsDentro++;
    } else {
      opsFuera++;
    }
  }

  const incentivoTotal = 
    (opsDentro * incentivoPositivo) +
    (opsFuera * incentivoNegativo);

  let mensaje = '';
  if (incentivoTotal > 0) {
    mensaje = `Buen desempeño en [KPI]. ${opsDentro} OPs dentro de margen este mes.`;
  } else if (incentivoTotal < 0) {
    mensaje = `Revisar con ${liderNombre} las causas de bajo desempeño en [KPI] — ${opsFuera} OPs fuera de margen este mes.`;
  } else {
    mensaje = `Desempeño neutro en [KPI].`;
  }

  return {
    lider: liderNombre,
    ops_dentro: opsDentro,
    ops_fuera: opsFuera,
    incentivo_total: incentivoTotal,
    recomendacion: mensaje
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const anio = parseInt(req.query.anio, 10);
  const mes = parseInt(req.query.mes, 10);

  if (!anio || !mes) {
    return res.status(400).json({ ok: false, error: 'Se requieren parámetros anio y mes' });
  }

  const sql = `
    SELECT k.nombre AS kpi_nombre, k.tipo_calculo, l.nombre AS lider_nombre
    FROM app_ops.kpi_definiciones k
    JOIN app_ops.lideres l ON k.lider_id = l.id
  `;
  const { rows } = await query(sql);

  const resultados = [];

  for (const row of rows) {
    if (row.tipo_calculo === 'cumplimiento_cantidad') {
      const calc = await kpiCumplimientoCantidad(anio, mes, row.lider_nombre);
      resultados.push({
        kpi: row.kpi_nombre,
        tipo_calculo: row.tipo_calculo,
        ...calc
      });
    } else {
      resultados.push({
        kpi: row.kpi_nombre,
        tipo_calculo: row.tipo_calculo,
        lider: row.lider_nombre,
        estado: 'no implementado'
      });
    }
  }

  res.json({ ok: true, data: resultados });
}));

module.exports = router;
