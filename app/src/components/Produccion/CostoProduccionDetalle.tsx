import { useState, useEffect } from 'react';
import { fetchCostoPorOrden, type OrdenProduccion, type CostoPorOrdenResumen } from '../../services/api';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function CostoProduccionDetalle() {
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setDate(1); // Primer día del mes
    return d.toISOString().split('T')[0];
  });
  
  const [fechaFin, setFechaFin] = useState(() => {
    const d = new Date();
    // Último día del mes actual
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return ultimoDia.toISOString().split('T')[0];
  });
  
  const [margenMinimo, setMargenMinimo] = useState(12.5);
  
  const [ordenes, setOrdenes] = useState<OrdenProduccion[]>([]);
  const [resumen, setResumen] = useState<CostoPorOrdenResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCostoPorOrden(fechaInicio, fechaFin, margenMinimo);
      setOrdenes(data.ordenes);
      setResumen(data.resumen);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaInicio, fechaFin, margenMinimo]);

  // Validar desactualización (> 7 días)
  let esDesactualizado = false;
  if (resumen?.ultima_actualizacion) {
    const ultima = new Date(resumen.ultima_actualizacion);
    const hoy = new Date();
    const diffDias = Math.floor((hoy.getTime() - ultima.getTime()) / (1000 * 3600 * 24));
    if (diffDias > 7) {
      esDesactualizado = true;
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      
      {/* Banner Superior de Actualización */}
      {resumen && (
        <div className={`px-8 py-2 text-xs font-medium flex items-center justify-center gap-2 border-b ${esDesactualizado ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          {esDesactualizado ? '⚠️' : '✅'}
          {resumen.ultima_actualizacion ? (
            <span>Datos calculados hasta: {new Date(resumen.ultima_actualizacion).toLocaleDateString('es-CO')} {esDesactualizado && '(Posible retraso en el pipeline)'}</span>
          ) : (
            <span>No hay registros en la base de datos</span>
          )}
        </div>
      )}

      {/* Header */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0 flex flex-wrap gap-4 justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-dashboard-textMain">Costo de Producción: Margen por OP</h2>
          <p className="text-sm text-dashboard-textMuted mt-1">Análisis detallado de rentabilidad por orden de producción</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-dashboard-textMuted mb-1 uppercase tracking-wider">Fecha Inicio</label>
            <input 
              type="date" 
              value={fechaInicio} 
              onChange={e => setFechaInicio(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-dashboard-textMain bg-slate-50 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-dashboard-textMuted mb-1 uppercase tracking-wider">Fecha Fin</label>
            <input 
              type="date" 
              value={fechaFin} 
              onChange={e => setFechaFin(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-dashboard-textMain bg-slate-50 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-dashboard-textMuted mb-1 uppercase tracking-wider">Umbral Crítico (%)</label>
            <input 
              type="number" 
              step="0.1"
              value={margenMinimo} 
              onChange={e => setMargenMinimo(parseFloat(e.target.value) || 0)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-dashboard-textMain bg-slate-50 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan w-32"
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 flex flex-col gap-6">

        {/* Tarjetas de Métricas Globales */}
        {resumen && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total OPs Período</span>
              <span className="text-2xl font-bold text-slate-800">{resumen.total_ops}</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Margen Promedio</span>
              <span className={`text-2xl font-bold ${resumen.margen_promedio < margenMinimo ? 'text-red-600' : 'text-slate-800'}`}>
                {resumen.margen_promedio}%
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bajo Umbral</span>
              <span className={`text-2xl font-bold ${resumen.ops_bajo_umbral > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {resumen.ops_bajo_umbral} <span className="text-sm font-normal text-slate-500 ml-1">OPs críticas</span>
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Valor Facturado</span>
              <span className="text-2xl font-bold text-slate-800">{fmtCOP.format(resumen.valor_facturado)}</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
          
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="text-sm font-semibold text-dashboard-textMain">Detalle de Órdenes Críticas</h3>
            <span className="text-xs font-semibold bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-100">
              Mostrando OPs con margen &lt; {margenMinimo}%
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-16 text-center">
                <div className="animate-spin inline-block w-6 h-6 border-2 border-slate-200 border-t-probolsas-cyan rounded-full mb-3"></div>
                <p className="text-sm text-dashboard-textMuted font-medium">Cargando información...</p>
              </div>
            ) : error ? (
              <div className="p-16 text-center flex flex-col items-center">
                <span className="text-3xl block mb-2">⚠️</span>
                <p className="text-red-500 font-medium text-sm mb-1">No se pudo obtener la información</p>
                <p className="text-xs text-dashboard-textMuted">{error}</p>
              </div>
            ) : resumen?.total_ops === 0 ? (
              <div className="p-16 text-center">
                <span className="text-4xl block mb-4">📭</span>
                <p className="text-slate-600 font-semibold text-sm">No hay órdenes registradas en este período</p>
                <p className="text-xs text-slate-400 mt-1">Intenta seleccionar un rango de fechas diferente.</p>
              </div>
            ) : ordenes.length === 0 ? (
              <div className="p-16 text-center">
                <span className="text-4xl block mb-4">✅</span>
                <p className="text-emerald-600 font-semibold text-sm">Todo está en orden</p>
                <p className="text-xs text-slate-400 mt-1">Ninguna OP de este período está por debajo del umbral de {margenMinimo}%.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-50 text-dashboard-textMuted text-[10px] uppercase tracking-wider border-b border-slate-100 sticky top-0 shadow-sm">
                    <th className="px-5 py-3 font-semibold bg-slate-50">Nro OP</th>
                    <th className="px-5 py-3 font-semibold bg-slate-50">Cliente</th>
                    <th className="px-5 py-3 font-semibold bg-slate-50">Referencia</th>
                    <th className="px-5 py-3 font-semibold bg-slate-50">Fecha</th>
                    <th className="px-5 py-3 font-semibold text-right bg-slate-50">Costo Estimado</th>
                    <th className="px-5 py-3 font-semibold text-right bg-slate-50">Costo Real</th>
                    <th className="px-5 py-3 font-semibold text-right bg-slate-50">Valor Venta</th>
                    <th className="px-5 py-3 font-semibold text-right bg-slate-50">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {ordenes.map((op, i) => {
                    // Pinta la fila completa si el margen es menor a la mitad del umbral
                    const isExtremelyCritical = op.margen_pct < (margenMinimo / 2);
                    return (
                      <tr key={`${op.nro_op}-${op.referencia}-${i}`} className={`transition-colors ${isExtremelyCritical ? 'bg-red-50 hover:bg-red-100/70' : 'hover:bg-slate-50/50'}`}>
                        <td className={`px-5 py-3 font-medium ${isExtremelyCritical ? 'text-red-900' : 'text-dashboard-textMain'}`}>{op.nro_op}</td>
                        <td className={`px-5 py-3 max-w-xs truncate ${isExtremelyCritical ? 'text-red-800' : 'text-slate-600'}`} title={op.cliente}>{op.cliente}</td>
                        <td className={`px-5 py-3 max-w-[200px] truncate ${isExtremelyCritical ? 'text-red-800' : 'text-slate-600'}`} title={op.referencia}>{op.referencia}</td>
                        <td className={`px-5 py-3 text-xs whitespace-nowrap ${isExtremelyCritical ? 'text-red-700' : 'text-dashboard-textMuted'}`}>
                          {new Date(op.fecha).toLocaleDateString('es-CO')}
                        </td>
                        <td className={`px-5 py-3 text-right tabular-nums ${isExtremelyCritical ? 'text-red-800' : 'text-slate-500'}`}>
                          {fmtCOP.format(op.costo_total_estimado)}
                        </td>
                        <td className={`px-5 py-3 text-right font-medium tabular-nums ${isExtremelyCritical ? 'text-red-900' : 'text-dashboard-textMain'}`}>
                          {fmtCOP.format(op.costo_ejecutado_total)}
                        </td>
                        <td className={`px-5 py-3 text-right font-medium tabular-nums ${isExtremelyCritical ? 'text-red-900 bg-red-100/50' : 'text-emerald-700 bg-emerald-50/30'}`}>
                          {fmtCOP.format(op.valor_cumplido)}
                        </td>
                        <td className={`px-5 py-3 text-right font-bold tabular-nums ${isExtremelyCritical ? 'text-red-700 bg-red-100/80' : 'text-red-600 bg-red-50/50'}`}>
                          {op.margen_pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
