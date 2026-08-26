const { query } = require('../src/dbClient.js');

async function loadParametrosFromDB(fecha = null) {
  try {
    let sql;
    let params = [];
    
    if (fecha) {
      sql = `
        SELECT clave, valor
        FROM app_ops.parametros
        WHERE vigente_desde <= $1::date 
          AND (vigente_hasta IS NULL OR vigente_hasta > $1::date)
      `;
      params.push(fecha);
    } else {
      sql = `
        SELECT clave, valor
        FROM app_ops.parametros
        WHERE vigente_hasta IS NULL
      `;
    }
    
    const { rows } = await query(sql, params);
    const mapa = {};
    rows.forEach(r => {
      mapa[r.clave] = parseFloat(r.valor);
    });
    return mapa;
  } catch (err) {
    console.error('loadParametrosFromDB error:', err.message);
    return {};
  }
}

async function kpiCumplimientoCantidad(anio, mesNum) {
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
    mensaje = `Revisar con [líder] las causas de bajo desempeño en [KPI] — ${opsFuera} OPs fuera de margen este mes.`;
  } else {
    mensaje = `Desempeño neutro en [KPI].`;
  }

  console.log(`\n=== Resultado ${anio}-${String(mesNum).padStart(2, '0')} ===`);
  console.log(`Total OPs analizadas: ${rows.length}`);
  console.log(`OPs dentro de margen: ${opsDentro}`);
  console.log(`OPs fuera de margen:  ${opsFuera}`);
  console.log(`Incentivo total:      $${incentivoTotal}`);
  console.log(`Recomendación:        ${mensaje}`);
}

async function run() {
  try {
    await kpiCumplimientoCantidad(2026, 7);
    await kpiCumplimientoCantidad(2026, 8);
  } catch (err) {
    console.error('Error calculando:', err);
  } finally {
    process.exit(0);
  }
}

run();
