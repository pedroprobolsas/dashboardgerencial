const fs = require('fs');
const path = require('path');

const file = path.join('app', 'src', 'components', 'Dashboard', 'FinanzasDashboard.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);\n  const [loading, setLoading] = useState(true);',
  'const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);\n  const [ventasSinIva, setVentasSinIva] = useState(0);\n  const [costosProduccion, setCostosProduccion] = useState(0);\n  const [loading, setLoading] = useState(true);'
);

content = content.replace(
  'const resp = await fetchSaldosContables();',
  `const [y, m] = fecha.split('-').map(Number);\n        const resp = await fetchSaldosContables(undefined, undefined, y, m);`
);

content = content.replace(
  'setUltimaActualizacion(resp.ultima_actualizacion);\n        }',
  'setUltimaActualizacion(resp.ultima_actualizacion);\n          setVentasSinIva(resp.ventas_sin_iva || 0);\n          setCostosProduccion(resp.costos_produccion || 0);\n        }'
);

content = content.replace(
  /\{\/\* 4 Metric Cards \*\/\}[\s\S]*?<\/div>/,
  `{/* 5 Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <MetricCard 
                title="Activos" 
                value={activosActual} 
                subtext={renderFlecha(activosActual, activosAnterior, false)}
              />
              <MetricCard 
                title="Pasivos" 
                value={pasivosActual} 
                subtext={renderFlecha(pasivosActual, pasivosAnterior, true)} 
              />
              <MetricCard 
                title="Gastos del Mes" 
                value={gastosActual} 
                subtext={renderPorcentaje(gastosActual)}
              />
              <MetricCard 
                title="Costos de Venta" 
                value={costosActual} 
                subtext={renderPorcentaje(costosActual)}
              />
              <MetricCard 
                title="Cost. Producción" 
                value={costosProduccion} 
                subtext={renderPorcentaje(costosProduccion)}
              />
            </div>`
);

content = content.replace(
  'const renderFlecha = (actual: number, anterior: number, inverso = false) => {',
  `const renderPorcentaje = (valor: number) => {
    if (!ventasSinIva || ventasSinIva === 0 || !valor) return <span className="text-slate-500">—</span>;
    const pct = (valor / ventasSinIva) * 100;
    const pctStr = pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct).toString();
    return <span className="text-slate-500 font-medium">{pctStr}% de ventas</span>;
  };

  const renderFlecha = (actual: number, anterior: number, inverso = false) => {`
);

fs.writeFileSync(file, content, 'utf8');
