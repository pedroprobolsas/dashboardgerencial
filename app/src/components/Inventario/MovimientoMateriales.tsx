import { useState, useEffect } from 'react';

// --- MOCK DATA ---
const mockYears = [2024, 2025, 2026];
const mockMonths = [
  { val: 1, label: 'Enero' }, { val: 2, label: 'Febrero' }, { val: 3, label: 'Marzo' },
  { val: 4, label: 'Abril' }, { val: 5, label: 'Mayo' }, { val: 6, label: 'Junio' },
  { val: 7, label: 'Julio' }, { val: 8, label: 'Agosto' }, { val: 9, label: 'Septiembre' },
  { val: 10, label: 'Octubre' }, { val: 11, label: 'Noviembre' }, { val: 12, label: 'Diciembre' }
];
const mockBodegas = ['Bodega Principal', 'Bodega Insumos', 'Bodega Cuarentena'];
const mockOrigenes = ['Ajuste de inventario', 'Recepción', 'Salida a producción', 'Traslado'];

export default function MovimientoMateriales() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [bodega, setBodega] = useState('Todas');
  const [origen, setOrigen] = useState('Todos');

  // Tabla Mock Data
  const [resultados, setResultados] = useState<any[]>([]);

  const fetchDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulación de carga desde el backend
      await new Promise(resolve => setTimeout(resolve, 800));
      setResultados([
        { id: 1, fecha: '2026-08-15', material: 'MOCK-01', cantidad: 500, origen: 'Recepción', bodega: 'Bodega Principal' },
        { id: 2, fecha: '2026-08-16', material: 'MOCK-02', cantidad: -20, origen: 'Salida a producción', bodega: 'Bodega Insumos' }
      ]);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los movimientos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatos();
  }, [year, month, bodega, origen]);

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.20))]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dashboard-textMain">Movimiento de Materiales</h1>
          <p className="text-sm text-dashboard-textMuted mt-1">
            Análisis de trazabilidad y movimientos de inventario (Fase A - En construcción)
          </p>
        </div>
        <button
          onClick={() => alert('Exportar no implementado en Fase A')}
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
            {mockYears.map(y => <option key={y} value={y}>{y}</option>)}
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
            {mockBodegas.map(b => <option key={b} value={b}>{b}</option>)}
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
            {mockOrigenes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* KPI MOCKS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
        {loading ? (
          [1,2,3,4].map(i => (
             <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3 animate-pulse">
                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                <div className="h-8 w-1/3 bg-slate-200 rounded"></div>
             </div>
          ))
        ) : (
          <>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MOCK - Movimientos</span>
              <p className="text-2xl font-bold text-slate-800">1,245</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MOCK - Entradas</span>
              <p className="text-2xl font-bold text-emerald-600">830</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MOCK - Salidas</span>
              <p className="text-2xl font-bold text-amber-600">415</p>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MOCK - Materiales</span>
              <p className="text-2xl font-bold text-indigo-600">120</p>
            </div>
          </>
        )}
      </div>

      {/* ÁREA DE RESULTADOS */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-sm font-bold text-dashboard-textMain">Detalle de Movimientos</h2>
          <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
            Estructura Mock - Columnas pendientes de esquema SQL
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-8 text-center text-red-500 font-medium">{error}</div>
          ) : loading ? (
            <div className="p-8 text-center text-slate-400">Cargando movimientos...</div>
          ) : resultados.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No se encontraron resultados para los filtros seleccionados.</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
              <thead className="text-xs text-slate-500 bg-white sticky top-0 border-b border-slate-100 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 font-semibold">Fecha (MOCK)</th>
                  <th className="px-6 py-3 font-semibold">Material (MOCK)</th>
                  <th className="px-6 py-3 font-semibold">Bodega (MOCK)</th>
                  <th className="px-6 py-3 font-semibold">Origen (MOCK)</th>
                  <th className="px-6 py-3 font-semibold text-right">Cantidad (MOCK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {resultados.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">{r.fecha}</td>
                    <td className="px-6 py-3 font-medium text-slate-700">{r.material}</td>
                    <td className="px-6 py-3">{r.bodega}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                        {r.origen}
                      </span>
                    </td>
                    <td className={`px-6 py-3 text-right font-medium ${r.cantidad > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {r.cantidad > 0 ? `+${r.cantidad}` : r.cantidad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
