import React, { useState, useEffect } from 'react';
import { fetchCostoPorOrden, type OrdenProduccion } from '../../services/api';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCostoPorOrden(fechaInicio, fechaFin, margenMinimo);
      setOrdenes(data.ordenes);
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

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
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
            <label className="text-[10px] font-semibold text-dashboard-textMuted mb-1 uppercase tracking-wider">Umbral Margen (%)</label>
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
      <div className="flex-1 overflow-auto p-8">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="text-sm font-semibold text-dashboard-textMain">Órdenes Críticas</h3>
            <span className="text-xs font-semibold bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-100">
              Mostrando OPs con margen &lt; {margenMinimo}%
            </span>
          </div>

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
          ) : ordenes.length === 0 ? (
            <div className="p-16 text-center">
              <span className="text-4xl block mb-4">✅</span>
              <p className="text-slate-600 font-semibold text-sm">Todo está en orden</p>
              <p className="text-xs text-slate-400 mt-1">No hay OPs por debajo del margen establecido en este período.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-50 text-dashboard-textMuted text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <th className="px-5 py-3 font-semibold">Nro OP</th>
                    <th className="px-5 py-3 font-semibold">Cliente</th>
                    <th className="px-5 py-3 font-semibold">Referencia</th>
                    <th className="px-5 py-3 font-semibold">Fecha</th>
                    <th className="px-5 py-3 font-semibold text-right">Costo Estimado</th>
                    <th className="px-5 py-3 font-semibold text-right">Costo Real</th>
                    <th className="px-5 py-3 font-semibold text-right">Valor Venta</th>
                    <th className="px-5 py-3 font-semibold text-right">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {ordenes.map((op, i) => (
                    <tr key={`${op.nro_op}-${op.referencia}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-dashboard-textMain">{op.nro_op}</td>
                      <td className="px-5 py-3 text-slate-600 max-w-xs truncate" title={op.cliente}>{op.cliente}</td>
                      <td className="px-5 py-3 text-slate-600 max-w-[200px] truncate" title={op.referencia}>{op.referencia}</td>
                      <td className="px-5 py-3 text-dashboard-textMuted text-xs whitespace-nowrap">
                        {new Date(op.fecha).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500 tabular-nums">
                        {fmtCOP.format(op.costo_total_estimado)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-dashboard-textMain tabular-nums">
                        {fmtCOP.format(op.costo_ejecutado_total)}
                      </td>
                      <td className="px-5 py-3 text-right text-emerald-700 font-medium tabular-nums bg-emerald-50/30">
                        {fmtCOP.format(op.valor_cumplido)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums bg-red-50/50 text-red-600">
                        {op.margen_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
