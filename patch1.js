const fs = require('fs');

const file = 'app/src/components/Inventario/CierreCosto.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add JSZip and file-saver
content = content.replace(
  "import { useState, useEffect } from 'react';",
  "import { useState, useEffect } from 'react';\nimport JSZip from 'jszip';\nimport { saveAs } from 'file-saver';\nimport * as XLSX from 'xlsx';"
);

// 2. Rename MovimientoMateriales to CierreCosto in the export
content = content.replace(
  "export default function MovimientoMateriales() {",
  "export default function CierreCosto() {"
);

// 3. Update the h1
content = content.replace(
  '<h1 className="text-2xl font-bold text-dashboard-textMain">Movimiento de Materiales</h1>',
  '<h1 className="text-2xl font-bold text-dashboard-textMain">Cierre de Costo</h1>'
);

// 4. Add DetalleCC101 component
const detalleComponent = `
function DetalleCC101({ year, month }: { year: number, month: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(\`/api/movimientos_materiales/detalle-cc101?anio=\${year}&mes=\${month}\`);
        if (!res.ok) throw new Error('Error cargando detalle');
        const json = await res.json();
        if (active && json.ok) setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [year, month]);

  const exportToExcel = (tableData: any[], sheetName: string, fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, \`\${fileName}.xlsx\`);
  };

  if (loading || !data) return <div className="p-8 text-center text-slate-400">Cargando detalle CC-101...</div>;

  return (
    <div className="mb-6 flex flex-col gap-6">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-dashboard-textMain">Detalle CC-101 — Costo de Ventas</h2>
        <p className="text-sm text-dashboard-textMuted mt-1">
          Análisis de facturación y OPs
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-700">Facturas del mes categorizadas</h3>
          <button onClick={() => exportToExcel(data.facturas, 'Facturas', 'facturas_mes')} className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">Exportar a Excel</button>
        </div>
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-white sticky top-0 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2">Factura</th>
                <th className="px-4 py-2 text-right">Valor Neto</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Categoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.facturas.map((f: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{f.nro_factura}</td>
                  <td className="px-4 py-2 text-right">{fmtCOP.format(f.valor_neto)}</td>
                  <td className="px-4 py-2 truncate max-w-[200px]" title={f.cliente}>{f.cliente}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">{f.categoria}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-700">OPs facturadas del mes</h3>
          <button onClick={() => exportToExcel(data.opsFacturadas, 'OPs', 'ops_facturadas')} className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">Exportar a Excel</button>
        </div>
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-white sticky top-0 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2">OP</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2 text-right">Costo Material</th>
                <th className="px-4 py-2 text-right">Costo MO</th>
                <th className="px-4 py-2 text-right">Costo CIF</th>
                <th className="px-4 py-2 text-right">Costo Ejecutado Total</th>
                <th className="px-4 py-2 text-right">Valor Cumplido</th>
                <th className="px-4 py-2 text-right">% Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.opsFacturadas.map((op: any, i: number) => {
                const avance = op.costo_ejecutado_total > 0 ? (op.valor_cumplido / op.costo_ejecutado_total) * 100 : 0;
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{op.nro_op}</td>
                    <td className="px-4 py-2 truncate max-w-[150px]" title={op.cliente}>{op.cliente}</td>
                    <td className="px-4 py-2 text-right">{fmtCOP.format(op.costo_material)}</td>
                    <td className="px-4 py-2 text-right">{fmtCOP.format(op.costo_mo)}</td>
                    <td className="px-4 py-2 text-right">{fmtCOP.format(op.costo_cif)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmtCOP.format(op.costo_ejecutado_total)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-600">{fmtCOP.format(op.valor_cumplido)}</td>
                    <td className="px-4 py-2 text-right">{avance.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-700">Top 10 Facturas Huérfanas (Sin OP)</h3>
          <button onClick={() => exportToExcel(data.facturasHuerfanas, 'Huerfanas', 'facturas_huerfanas')} className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">Exportar a Excel</button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-white sticky top-0 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2">Factura</th>
                <th className="px-4 py-2 text-right">Valor Neto</th>
                <th className="px-4 py-2">Cliente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.facturasHuerfanas.map((f: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{f.nro_factura}</td>
                  <td className="px-4 py-2 text-right text-amber-600 font-semibold">{fmtCOP.format(f.valor_neto)}</td>
                  <td className="px-4 py-2 truncate max-w-[300px]" title={f.cliente}>{f.cliente}</td>
                </tr>
              ))}
              {data.facturasHuerfanas.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-400">No hay facturas huérfanas positivas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
`;

content = content.replace("export default function CierreCosto() {", detalleComponent + "\nexport default function CierreCosto() {");

// 5. Inject the new KPIs into the JSX
const oldKpisBlock = `          <>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Movimientos Filtrados</span>
              <p className="text-2xl font-bold text-slate-800">{fmtNum.format(kpis.movimientos)}</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Valor Total Depurado</span>
              <p className="text-2xl font-bold text-indigo-600">{fmtCOP.format(kpis.valor_movimientos)}</p>
              {kpis.anomalias_excluidas > 0 && (
                <p className="text-[10px] text-red-500 font-medium">
                  {kpis.anomalias_excluidas} {kpis.anomalias_excluidas === 1 ? 'movimiento anómalo excluido' : 'movimientos anómalos excluidos'}
                </p>
              )}
            </div>
          </>`;

const newKpisBlock = `          <>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Movimientos Filtrados</span>
              <p className="text-2xl font-bold text-slate-800">{fmtNum.format(kpis.movimientos)}</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Valor Total Depurado</span>
              <p className="text-2xl font-bold text-indigo-600">{fmtCOP.format(kpis.valor_movimientos)}</p>
              {kpis.anomalias_excluidas > 0 && (
                <p className="text-[10px] text-red-500 font-medium">
                  {kpis.anomalias_excluidas} {kpis.anomalias_excluidas === 1 ? 'movimiento anómalo excluido' : 'movimientos anómalos excluidos'}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {cierreCostos && cierreCostos.kpisCC101 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ventas Netas del Mes</span>
            <p className="text-2xl font-bold text-slate-800">{fmtCOP.format(cierreCostos.kpisCC101.ventasNetas)}</p>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2 relative">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Costo Real por OP</span>
            <p className="text-2xl font-bold text-slate-800">{fmtCOP.format(cierreCostos.kpisCC101.costoRealOP)}</p>
            {cierreCostos.kpisCC101.alertas?.opsSinValorCumplido > 0 && (
              <span className="absolute top-4 right-4 flex h-3 w-3" title={\`\${cierreCostos.kpisCC101.alertas.opsSinValorCumplido} OPs sin valor cumplido (costo asignado 0)\`}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
            {cierreCostos.kpisCC101.alertas?.opsFacturacionExcede > 0 && (
              <span className="text-[10px] text-amber-600 font-medium mt-1">
                ⚠️ {cierreCostos.kpisCC101.alertas.opsFacturacionExcede} OPs con ratio capado a 1.0
              </span>
            )}
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ajuste de Inventario</span>
            <p className="text-2xl font-bold text-slate-800">{fmtCOP.format(cierreCostos.kpisCC101.ajusteInventario)}</p>
          </div>
          <div className="bg-indigo-600 rounded-3xl shadow-sm border border-indigo-700 p-5 flex flex-col gap-2">
            <span className="text-xs font-medium text-indigo-200 uppercase tracking-wide">CC-101 Propuesto</span>
            <p className="text-3xl font-bold text-white">{fmtCOP.format(cierreCostos.kpisCC101.cc101Propuesto)}</p>
            <p className="text-[10px] text-indigo-200 font-medium">Ratio aplicado: {(cierreCostos.ratioAplicado * 100).toFixed(2)}%</p>
          </div>
        </div>
      )}`;

content = content.replace(oldKpisBlock + '\n        )}\n      </div>', newKpisBlock);

fs.writeFileSync(file, content);
