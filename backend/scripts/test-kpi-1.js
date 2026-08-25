const { query } = require('../src/dbClient.js');

async function kpiCumplimientoCantidad(anio, mesNum, paramsSimulados) {
  const primerDiaMes = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
  const sql = `
    SELECT
      nro_orden,
      cantidad_pedida,
      cantidad_cumplida,
      (cantidad_cumplida / NULLIF(cantidad_pedida, 0)) AS ratio
    FROM crisolweb.ordenes_cumplidas
    WHERE fecha_cumplimiento >= $1::date
      AND fecha_cumplimiento < ($1::date + INTERVAL '1 month')
      AND cantidad_pedida IS NOT NULL
  `;
  
  const { rows } = await query(sql, [primerDiaMes]);

  const margen = paramsSimulados.kpi_cumplimiento_margen / 100;
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
    (opsDentro * paramsSimulados.kpi_cumplimiento_incentivo_positivo) +
    (opsFuera * paramsSimulados.kpi_cumplimiento_incentivo_negativo);

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
    const paramsJulio = {
      kpi_cumplimiento_margen: 5,
      kpi_cumplimiento_incentivo_positivo: 2000,
      kpi_cumplimiento_incentivo_negativo: -4000
    };
    
    const paramsAgosto = {
      kpi_cumplimiento_margen: 5,
      kpi_cumplimiento_incentivo_positivo: 2000,
      kpi_cumplimiento_incentivo_negativo: -4000
    };

    await kpiCumplimientoCantidad(2026, 7, paramsJulio);
    await kpiCumplimientoCantidad(2026, 8, paramsAgosto);
  } catch (err) {
    console.error('Error calculando:', err);
  } finally {
    process.exit(0);
  }
}

run();
