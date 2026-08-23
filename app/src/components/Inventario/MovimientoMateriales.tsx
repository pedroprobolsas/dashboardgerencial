import { useState, useEffect } from 'react';

const mockMonths = [
  { val: 1, label: 'Enero' }, { val: 2, label: 'Febrero' }, { val: 3, label: 'Marzo' },
  { val: 4, label: 'Abril' }, { val: 5, label: 'Mayo' }, { val: 6, label: 'Junio' },
  { val: 7, label: 'Julio' }, { val: 8, label: 'Agosto' }, { val: 9, label: 'Septiembre' },
  { val: 10, label: 'Octubre' }, { val: 11, label: 'Noviembre' }, { val: 12, label: 'Diciembre' }
];

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtCOPCierre = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });
const fmtDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleDateString('es-CO', { timeZone: 'UTC' }) : '—';

function ReporteCierreSiigo({ defaultYear, defaultMonth, mockMonths, availableYears }: { defaultYear: number, defaultMonth: number, mockMonths: any[], availableYears: number[] }) {
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ code: string; concept: string; valor: number }[]>([]);
  const [estado, setEstado] = useState('sin datos');

  useEffect(() => {
    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/movimientos_materiales/reporte-siigo-detalle?anio=${year}&mes=${month}`);
        if (!res.ok) throw new Error('Network response was not ok');
        const json = await res.json();
        if (active && json.ok) {
          setData(json.data);
          setEstado(json.estado_mes);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [year, month]);

  const total72 = data.filter(d => d.code.startsWith('72')).reduce((acc, curr) => acc + curr.valor, 0);
  const total73 = data.filter(d => d.code.startsWith('73')).reduce((acc, curr) => acc + curr.valor, 0);
  const total = total72 + total73;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const monthName = mockMonths.find(m => m.val === month)?.label || '';
    const now = new Date().toLocaleString('es-CO');
    
    let rowsHtml = data.map(d => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${d.code}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${d.concept}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${fmtCOPCierre.format(d.valor)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reporte Cierre Costos SIIGO - ${monthName} ${year}</title>
        <style>
          body { font-family: sans-serif; color: #333; margin: 40px; }
          h1 { font-size: 20px; margin-bottom: 5px; }
          .meta { font-size: 12px; color: #666; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px; }
          th { background: #f8f9fa; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
          .summary { max-width: 400px; margin-left: auto; border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
          .summary-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <h1>Reporte para Cierre de Costos — SIIGO</h1>
        <div class="meta">
          Período: <strong>${monthName} ${year}</strong> &nbsp;|&nbsp; 
          Estado del mes: <strong>${estado.toUpperCase()}</strong> &nbsp;|&nbsp; 
          Generado: <strong>${now}</strong>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Concepto</th>
              <th style="text-align: right;">Débito Acumulado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="3" style="text-align:center; padding:20px;">Sin datos</td></tr>'}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-row">
            <span>Total 72 - Mano de obra:</span>
            <span>${fmtCOPCierre.format(total72)}</span>
          </div>
          <div class="summary-row">
            <span>Total 73 - Otros costos de fabricación:</span>
            <span>${fmtCOPCierre.format(total73)}</span>
          </div>
          <div class="summary-total">
            <span>Total para cierre (72+73):</span>
            <span>${fmtCOPCierre.format(total)}</span>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-dashboard-textMain">Reporte para Cierre de Costos — SIIGO</h2>
          <p className="text-sm text-dashboard-textMuted mt-1">
            Detalle de cuentas 72 y 73 (excluye comprobantes de cierre).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 bg-slate-50"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 bg-slate-50"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {mockMonths.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
          <button
            onClick={handlePrint}
            disabled={loading || data.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            Imprimir / Descargar PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-8">
        {loading ? (
          <div className="flex-1 text-center py-8 text-slate-400">Cargando reporte...</div>
        ) : (
          <>
            {/* Detalle */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cuenta</th>
                    <th className="px-4 py-3 font-semibold">Concepto</th>
                    <th className="px-4 py-3 font-semibold text-right">Débito Acumulado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin datos para el período seleccionado</td></tr>
                  ) : (
                    data.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-700">{r.code}</td>
                        <td className="px-4 py-2 truncate max-w-[250px]" title={r.concept}>{r.concept}</td>
                        <td className="px-4 py-2 text-right font-medium">{fmtCOPCierre.format(r.valor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumen Sidebar */}
            <div className="w-full md:w-[350px] bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col gap-4 h-fit">
              <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">Resumen del Mes</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${estado === 'cerrado' ? 'bg-emerald-100 text-emerald-700' : estado === 'pendiente' ? 'bg-red-100 text-red-700' : estado === 'parcial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                  {estado.toUpperCase()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-slate-600">Total 72 - Mano de obra</span>
                <span className="text-lg font-semibold text-slate-800">{fmtCOPCierre.format(total72)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-slate-600">Total 73 - Otros costos de fabricación</span>
                <span className="text-lg font-semibold text-slate-800">{fmtCOPCierre.format(total73)}</span>
              </div>
              <div className="flex flex-col gap-1 pt-3 border-t border-slate-200 mt-2">
                <span className="text-sm font-bold text-slate-800">Total para cierre (72+73)</span>
                <span className="text-2xl font-bold text-indigo-700">{fmtCOPCierre.format(total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CoherenciaCostos({ defaultYear, mockMonths, availableYears }: { defaultYear: number, mockMonths: any[], availableYears: number[] }) {
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);
  const [dataPorMes, setDataPorMes] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const fetchAnual = async () => {
      setLoading(true);
      try {
        const promises = mockMonths.map(async (m) => {
          const res = await fetch(`/api/movimientos_materiales/cierre-costos?anio=${year}&mes=${m.val}`);
          if (!res.ok) return { mes: m.label, error: true };
          const json = await res.json();
          return { mes: m.label, data: json.ok ? json : null };
        });
        const results = await Promise.all(promises);
        if (active) setDataPorMes(results);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAnual();
    return () => { active = false; };
  }, [year, mockMonths]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-dashboard-textMain">Coherencia de Costos (Anual)</h2>
          <p className="text-sm text-dashboard-textMuted mt-1">
            Análisis de Cierre Mensual · No es modificado por los filtros de Bodega y Origen
          </p>
        </div>
        <select
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all bg-slate-50"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-semibold">Mes</th>
                <th className="px-5 py-3 font-semibold text-right">Consumo Real MP (Depurado)</th>
                <th className="px-5 py-3 font-semibold text-right">Producción Terminada</th>
                <th className="px-5 py-3 font-semibold text-right">Otros costos Crisol</th>
                <th className="px-5 py-3 font-semibold text-right">Otros costos SIIGO</th>
                <th className="px-5 py-3 font-semibold text-right" title="Diferencia por analizar">Dif. Crisol vs SIIGO</th>
                <th className="px-5 py-3 font-semibold text-right">% Dif.</th>
                <th className="px-5 py-3 font-semibold text-right">Compras MP</th>
                <th className="px-5 py-3 font-semibold text-right">% Ajustes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 relative">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-slate-400">
                    Calculando meses del año...
                  </td>
                </tr>
              )}
              {!loading && dataPorMes.map((row, i) => {
                if (!row.data || !row.data.controlCierre) return (
                   <tr key={i}><td className="px-5 py-3 font-medium text-slate-700">{row.mes}</td><td colSpan={8} className="text-slate-400 px-5 py-3 text-center">Sin datos</td></tr>
                );

                const c = row.data;
                const depurado = Number(c.controlCierre.depurado) || 0;
                const produccion = Number(c.produccionTerminada.total) || 0;
                const compras = Number(c.comprasMateriaPrima.total) || 0;
                const ajustes = Number(c.controlCierre.ajustesDepurado) || 0;
                
                const otrosCostos = produccion - depurado;
                const pctAjustes = depurado > 0 ? (ajustes / depurado) * 100 : 0;
                const isAlert = Math.abs(pctAjustes) > 30;

                // SIIGO
                const siigo = c.siigo;
                const siigoManoObra = Number(siigo?.costos_mano_obra_72) || 0;
                const siigoOtros = Number(siigo?.costos_otros_73) || 0;
                const otrosCostosSiigo = siigoManoObra + siigoOtros;
                const diffSiigo = otrosCostos - otrosCostosSiigo;
                const pctDiffSiigo = otrosCostosSiigo !== 0 ? (diffSiigo / otrosCostosSiigo) * 100 : 0;
                const estadoSiigo = siigo?.estado_mes || '';

                let estadoIcon = null;
                if (estadoSiigo === 'pendiente') estadoIcon = <span className="inline-block w-2 h-2 rounded-full bg-red-400 ml-1.5" title="Estado Pendiente (puede cambiar)"></span>;
                else if (estadoSiigo === 'parcial') estadoIcon = <span className="inline-block w-2 h-2 rounded-full bg-amber-400 ml-1.5" title="Estado Parcial (puede cambiar)"></span>;
                else if (estadoSiigo === 'cerrado') estadoIcon = <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 ml-1.5" title="Estado Cerrado"></span>;

                return (
                  <tr key={i} className={`hover:bg-slate-50 transition-colors ${isAlert ? 'bg-red-50' : ''}`}>
                    <td className={`px-5 py-3 font-medium flex items-center ${isAlert ? 'text-red-700' : 'text-slate-700'}`}>
                      {row.mes} {estadoIcon}
                    </td>
                    <td className={`px-5 py-3 text-right font-semibold ${isAlert ? 'text-red-700' : 'text-slate-800'}`}>{fmtCOP.format(depurado)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${isAlert ? 'text-red-600' : 'text-emerald-700'}`}>{fmtCOP.format(produccion)}</td>
                    <td className={`px-5 py-3 text-right font-semibold text-amber-700`}>{fmtCOPCierre.format(otrosCostos)}</td>
                    
                    <td className="px-5 py-3 text-right font-semibold text-blue-700" title={`Mano de obra (72): ${fmtCOPCierre.format(siigoManoObra)}\nOtros fábrica (73): ${fmtCOPCierre.format(siigoOtros)}`}>
                      {fmtCOPCierre.format(otrosCostosSiigo)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-600" title="Diferencia por analizar">
                      {fmtCOPCierre.format(diffSiigo)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-500">
                      {siigo ? `${pctDiffSiigo.toFixed(2)}%` : '—'}
                    </td>

                    <td className={`px-5 py-3 text-right font-medium ${isAlert ? 'text-red-600' : 'text-indigo-700'}`}>{fmtCOP.format(compras)}</td>
                    <td className={`px-5 py-3 text-right font-bold ${isAlert ? 'text-red-700' : 'text-slate-600'}`}>
                      {pctAjustes.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
export default function MovimientoMateriales() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros Disponibles
  const [years, setYears] = useState<number[]>([new Date().getFullYear()]);
  const [bodegas, setBodegas] = useState<string[]>([]);
  const [origenes, setOrigenes] = useState<string[]>([]);

  // Filtros Seleccionados
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [bodega, setBodega] = useState('Todas');
  const [origen, setOrigen] = useState('Todos');

  // Paginación
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  // Data
  const [resultados, setResultados] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({
    movimientos: 0,
    entradas: 0,
    salidas: 0,
    valor_movimientos: 0
  });
  
  // Resumen Cierre Costos
  const [cierreCostos, setCierreCostos] = useState<any>(null);
  const [loadingCierre, setLoadingCierre] = useState(false);

  const fetchFiltros = async () => {
    try {
      const res = await fetch('/api/movimientos_materiales/filtros');
      if (!res.ok) throw new Error('Error cargando filtros');
      const data = await res.json();
      if (data.ok) {
        setYears(data.anios?.length > 0 ? data.anios : [new Date().getFullYear()]);
        setBodegas(data.bodegas || []);
        setOrigenes(data.origenes || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDatos = async (resetPage = false) => {
    const currentPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        anio: year.toString(),
        mes: month.toString(),
        bodega,
        origen,
        page: currentPage.toString(),
        limit: limit.toString()
      });
      const res = await fetch(`/api/movimientos_materiales?${qs.toString()}`);
      if (!res.ok) throw new Error('Error al consultar movimientos');
      const data = await res.json();
      
      if (data.ok) {
        setResultados(data.data);
        setTotalPages(data.totalPages || 1);
        setKpis(data.kpis);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar los movimientos');
    } finally {
      setLoading(false);
    }
  };

  const fetchCierreCostos = async () => {
    setLoadingCierre(true);
    try {
      const res = await fetch(`/api/movimientos_materiales/cierre-costos?anio=${year}&mes=${month}`);
      if (!res.ok) throw new Error('Error al consultar cierre de costos');
      const data = await res.json();
      if (data.ok) {
        setCierreCostos(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCierre(false);
    }
  };

  useEffect(() => {
    fetchFiltros();
  }, []);

  useEffect(() => {
    fetchCierreCostos();
    // eslint-disable-next-line
  }, [year, month]);

  useEffect(() => {
    fetchDatos(true);
    // eslint-disable-next-line
  }, [year, month, bodega, origen]);

  useEffect(() => {
    fetchDatos(false);
    // eslint-disable-next-line
  }, [page]);

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.20))]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dashboard-textMain">Movimiento de Materiales</h1>
          <p className="text-sm text-dashboard-textMuted mt-1">
            Análisis de trazabilidad y movimientos de inventario
          </p>
        </div>
        <button
          onClick={() => alert('Exportar próximamente...')}
          className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
        >
          Exportar a Excel
        </button>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end mb-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Año</label>
          <select 
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all bg-slate-50"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Mes</label>
          <select 
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all bg-slate-50"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {mockMonths.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Bodega</label>
          <select 
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all bg-slate-50 min-w-[200px]"
            value={bodega}
            onChange={(e) => setBodega(e.target.value)}
          >
            <option value="Todas">Todas las Bodegas</option>
            {bodegas.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Origen</label>
          <select 
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all bg-slate-50 min-w-[200px]"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
          >
            <option value="Todos">Todos los orígenes</option>
            {origenes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {loading && resultados.length === 0 ? (
          [1,2].map(i => (
             <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3 animate-pulse">
                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                <div className="h-8 w-1/3 bg-slate-200 rounded"></div>
             </div>
          ))
        ) : (
          <>
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

      {/* RESUMEN CIERRE DE COSTOS */}
      <div className="mb-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-dashboard-textMain">Resumen Cierre de Costos</h2>
          <p className="text-sm text-dashboard-textMuted mt-1">
            Vista mensual completa · Bodega y Origen no modifican este resumen
          </p>
        </div>
        
        {loadingCierre || !cierreCostos ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex items-center justify-center text-slate-400">
            Cargando cierre de costos...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Tarjetas Principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Consumo Real de MP</span>
                <p className="text-3xl font-bold text-slate-800 my-1">{fmtCOPCierre.format(cierreCostos.controlCierre?.depurado || 0)}</p>
                <p className="text-[10px] text-slate-400 font-mono">Cumplido Requisición Depurado</p>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Producción Terminada</span>
                <p className="text-3xl font-bold text-emerald-700 my-1">{fmtCOPCierre.format(cierreCostos.produccionTerminada.total)}</p>
                <p className="text-[10px] text-slate-400 font-mono">Origen Crisolweb: Cumplido Produccion</p>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Compras de Materia Prima</span>
                <p className="text-3xl font-bold text-indigo-700 my-1">{fmtCOPCierre.format(cierreCostos.comprasMateriaPrima.total)}</p>
                <p className="text-[10px] text-slate-400 font-mono">Origen Crisolweb: Compra / Bodega 00 Materia Prima</p>
              </div>
              {(() => {
                const depurado = Number(cierreCostos.controlCierre?.depurado) || 0;
                const ajustes = Number(cierreCostos.controlCierre?.ajustesDepurado) || 0;
                const pctAjustes = depurado > 0 ? (ajustes / depurado) * 100 : 0;
                const isAlert = Math.abs(pctAjustes) > 30;
                return (
                  <div className={`bg-white rounded-3xl shadow-sm border p-5 flex flex-col gap-1 ${isAlert ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}>
                    <span className={`text-sm font-semibold ${isAlert ? 'text-red-700' : 'text-slate-600'}`}>% Ajustes sobre Consumo Real de MP</span>
                    <p className={`text-3xl font-bold my-1 ${isAlert ? 'text-red-700' : 'text-slate-600'}`}>{pctAjustes.toFixed(1)}%</p>
                    <p className={`text-[10px] font-mono ${isAlert ? 'text-red-500' : 'text-slate-400'}`}>Ajustes válidos / Consumo Real de MP</p>
                  </div>
                );
              })()}
            </div>

            {/* Detalle por bodega */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Produccion Terminada */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700">Producción Terminada por Bodega</h3>
                </div>
                <div className="p-0 flex-1">
                  <table className="w-full text-left text-sm text-slate-600">
                    <tbody className="divide-y divide-slate-100">
                      {cierreCostos.produccionTerminada.porBodega.map((b: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5 font-medium">{b.bodega}</td>
                          <td className="px-5 py-2.5 text-right text-emerald-700 font-semibold">{fmtCOPCierre.format(b.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                      <tr>
                        <td className="px-5 py-3 text-xs uppercase tracking-wide">Total Producción Terminada por Bodega</td>
                        <td className="px-5 py-3 text-right text-emerald-700">{fmtCOPCierre.format(cierreCostos.produccionTerminada.total)}</td>
                      </tr>
                      {Number(cierreCostos.controles.diferenciaProduccion) !== 0 && (
                        <tr>
                          <td className="px-5 py-2 text-xs uppercase tracking-wide text-red-600 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span> Diferencia de Cuadre
                          </td>
                          <td className="px-5 py-2 text-right text-red-600">{fmtCOPCierre.format(cierreCostos.controles.diferenciaProduccion)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Consumo Materia Prima */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700">Consumo de Materia Prima por Bodega</h3>
                </div>
                <div className="p-0 flex-1">
                  <table className="w-full text-left text-sm text-slate-600">
                    <tbody className="divide-y divide-slate-100">
                      {cierreCostos.consumoMateriaPrima.porBodega.map((b: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5 font-medium">{b.bodega}</td>
                          <td className="px-5 py-2.5 text-right font-semibold">{fmtCOPCierre.format(b.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                      <tr>
                        <td className="px-5 py-3 text-xs uppercase tracking-wide">Total Consumo por Bodega</td>
                        <td className="px-5 py-3 text-right">{fmtCOPCierre.format(cierreCostos.consumoMateriaPrima.total)}</td>
                      </tr>
                      {Number(cierreCostos.controles.diferenciaConsumo) !== 0 && (
                        <tr>
                          <td className="px-5 py-2 text-xs uppercase tracking-wide text-red-600 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span> Diferencia de Cuadre
                          </td>
                          <td className="px-5 py-2 text-right text-red-600">{fmtCOPCierre.format(cierreCostos.controles.diferenciaConsumo)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTROL DE CIERRE */}
      {cierreCostos?.controlCierre && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-dashboard-textMain mb-4">Control de Cierre (Movimientos Anómalos)</h2>
          <div className="flex flex-col gap-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Cumplido Requisición Bruto</span>
                <p className="text-2xl font-bold text-slate-800 my-1">{fmtCOPCierre.format(cierreCostos.controlCierre.bruto)}</p>
                <p className="text-[10px] text-slate-400 font-mono">Sin depurar anomalías</p>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Movimientos Observados</span>
                <p className="text-2xl font-bold text-red-600 my-1">{fmtCOPCierre.format(cierreCostos.controlCierre.totalAnomalias)}</p>
                <p className="text-[10px] text-slate-400 font-mono">{cierreCostos.controlCierre.listaAnomalias.length} registro(s) detectado(s)</p>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Cumplido Requisición Depurado</span>
                <p className="text-2xl font-bold text-emerald-700 my-1">{fmtCOPCierre.format(cierreCostos.controlCierre.depurado)}</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Consumo: {fmtCOPCierre.format(cierreCostos.controlCierre.consumoDepurado)} | Ajustes: {fmtCOPCierre.format(cierreCostos.controlCierre.ajustesDepurado)}
                </p>
              </div>
            </div>

            {cierreCostos.controlCierre.listaAnomalias.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <h3 className="text-sm font-bold text-red-700">Existen movimientos con valores anómalos que requieren revisión en Crisolweb</h3>
                </div>
                <div className="p-0 overflow-auto">
                  <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                    <thead className="text-xs text-slate-500 bg-white border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Fecha</th>
                        <th className="px-4 py-3 font-semibold">Consecutivo</th>
                        <th className="px-4 py-3 font-semibold">Material</th>
                        <th className="px-4 py-3 font-semibold">Concepto</th>
                        <th className="px-4 py-3 font-semibold text-right">Precio</th>
                        <th className="px-4 py-3 font-semibold text-right">Valor Total</th>
                        <th className="px-4 py-3 font-semibold">Documento</th>
                        <th className="px-4 py-3 font-semibold">Bodega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cierreCostos.controlCierre.listaAnomalias.map((a: any, i: number) => (
                        <tr key={i} className="hover:bg-red-50/50">
                          <td className="px-4 py-2.5">{fmtDate(a.fecha)}</td>
                          <td className="px-4 py-2.5 font-medium">{a.consecutivo}</td>
                          <td className="px-4 py-2.5 truncate max-w-[150px]" title={a.material}>{a.material}</td>
                          <td className="px-4 py-2.5 text-xs">{a.concepto}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{fmtCOPCierre.format(a.precio)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmtCOPCierre.format(a.valor_total)}</td>
                          <td className="px-4 py-2.5 text-xs">{a.documento}</td>
                          <td className="px-4 py-2.5 text-xs">{a.bodega}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COHERENCIA DE COSTOS (ANUAL) */}
      <CoherenciaCostos defaultYear={year} mockMonths={mockMonths} availableYears={years} />

      {/* REPORTE CIERRE COSTOS SIIGO */}
      <ReporteCierreSiigo defaultYear={year} defaultMonth={month} mockMonths={mockMonths} availableYears={years} />

      {/* ÁREA DE RESULTADOS */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-sm font-bold text-dashboard-textMain">Detalle de Movimientos</h2>
          
          {/* Paginación */}
          <div className="flex items-center gap-2">
            <button 
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 bg-white border border-slate-200 rounded text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-600 font-medium">Página {page} de {totalPages || 1}</span>
            <button 
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 bg-white border border-slate-200 rounded text-sm disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto relative">
          {error ? (
            <div className="p-8 text-center text-red-500 font-medium">{error}</div>
          ) : resultados.length === 0 && !loading ? (
            <div className="p-8 text-center text-slate-400">No se encontraron resultados para los filtros seleccionados.</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
              <thead className="text-xs text-slate-500 bg-white sticky top-0 border-b border-slate-100 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Consecutivo</th>
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 font-semibold">T. Movimiento</th>
                  <th className="px-4 py-3 font-semibold">Concepto</th>
                  <th className="px-4 py-3 font-semibold text-right">Entrada</th>
                  <th className="px-4 py-3 font-semibold text-right">Salida</th>
                  <th className="px-4 py-3 font-semibold text-right">Precio</th>
                  <th className="px-4 py-3 font-semibold text-right">Valor Total</th>
                  <th className="px-4 py-3 font-semibold">Origen</th>
                  <th className="px-4 py-3 font-semibold">Documento</th>
                  <th className="px-4 py-3 font-semibold">Tercero</th>
                  <th className="px-4 py-3 font-semibold">Bodega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {resultados.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-2.5 text-slate-500">{fmtDate(r.fecha)}</td>
                    <td className="px-4 py-2.5">{r.consecutivo || '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.material || '—'}</td>
                    <td className="px-4 py-2.5">{r.tipo_movimiento || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px] truncate" title={r.concepto}>{r.concepto || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-emerald-600">
                      {r.entradas > 0 ? fmtNum.format(r.entradas) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-amber-600">
                      {r.salida > 0 ? fmtNum.format(r.salida) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {r.precio ? fmtCOP.format(r.precio) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {r.valor_total ? fmtCOP.format(r.valor_total) : '—'}
                    </td>
                    <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">{r.origen || '—'}</span></td>
                    <td className="px-4 py-2.5">{r.documento || '—'}</td>
                    <td className="px-4 py-2.5 text-xs truncate max-w-[150px]" title={r.tercero}>{r.tercero || '—'}</td>
                    <td className="px-4 py-2.5 text-xs">{r.bodega || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {loading && resultados.length > 0 && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20">
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 text-sm font-medium text-slate-600">
                Actualizando...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
