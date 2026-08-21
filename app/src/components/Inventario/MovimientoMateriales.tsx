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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
        {loading && resultados.length === 0 ? (
          [1,2,3,4].map(i => (
             <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3 animate-pulse">
                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                <div className="h-8 w-1/3 bg-slate-200 rounded"></div>
             </div>
          ))
        ) : (
          <>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Movimientos</span>
              <p className="text-2xl font-bold text-slate-800">{fmtNum.format(kpis.movimientos)}</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Entradas</span>
              <p className="text-2xl font-bold text-emerald-600">{fmtNum.format(kpis.entradas)}</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Salidas</span>
              <p className="text-2xl font-bold text-amber-600">{fmtNum.format(kpis.salidas)}</p>
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
        <h2 className="text-lg font-bold text-dashboard-textMain mb-4">Resumen Cierre de Costos</h2>
        
        {loadingCierre || !cierreCostos ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex items-center justify-center text-slate-400">
            Cargando cierre de costos...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Tarjetas Principales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-600">Consumo de Materia Prima</span>
                <p className="text-3xl font-bold text-slate-800 my-1">{fmtCOPCierre.format(cierreCostos.consumoMateriaPrima.total)}</p>
                <p className="text-[10px] text-slate-400 font-mono">Origen Crisolweb: Cumplido Requisicion / CONSUMO MATERIA PRIMA</p>
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
