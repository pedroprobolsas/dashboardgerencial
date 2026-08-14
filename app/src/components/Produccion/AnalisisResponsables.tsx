import { useState, useEffect } from 'react';
import { fetchAnalisisResponsables, type LineaResponsable, type IndicadoresResponsables } from '../../services/api';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export default function AnalisisResponsables() {
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  
  const [fechaFin, setFechaFin] = useState(() => {
    const d = new Date();
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return ultimoDia.toISOString().split('T')[0];
  });
  
  const [detalle, setDetalle] = useState<LineaResponsable[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresResponsables | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalisisResponsables(fechaInicio, fechaFin);
      setDetalle(data.detalle);
      setIndicadores(data.indicadores);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaInicio, fechaFin]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      
      {/* Header */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0 flex flex-wrap gap-4 justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-dashboard-textMain">Análisis por Responsable</h2>
          <p className="text-sm text-dashboard-textMuted mt-1">Variación de costos (Efecto Horas vs Efecto Tarifa) en Mano de Obra</p>
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
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 flex flex-col gap-6">

        {/* Tarjetas de Métricas Globales */}
        {indicadores && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 bg-slate-100 px-3 py-1 rounded-full">Efecto Horas (Jesús)</span>
              <span className={`text-3xl font-black ${indicadores.jesus_efecto_horas > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {indicadores.jesus_efecto_horas > 0 ? '+' : ''}{fmtCOP.format(indicadores.jesus_efecto_horas)}
              </span>
              <span className="text-xs text-slate-400 mt-2">Impacto en pesos por variación en la cantidad de horas ejecutadas.</span>
            </div>
            
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 bg-slate-100 px-3 py-1 rounded-full">Efecto Tarifa (Cristian)</span>
              <span className={`text-3xl font-black ${indicadores.cristian_efecto_tarifa > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {indicadores.cristian_efecto_tarifa > 0 ? '+' : ''}{fmtCOP.format(indicadores.cristian_efecto_tarifa)}
              </span>
              <span className="text-xs text-slate-400 mt-2">Impacto en pesos por variación en la tarifa ($/hora) ejecutada.</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
          
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="text-sm font-semibold text-dashboard-textMain">Detalle de Variaciones por OP (Mano de Obra)</h3>
            <span className="text-xs text-dashboard-textMuted">Ordenadas de mayor a menor desfase de horas.</span>
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
            ) : detalle.length === 0 ? (
              <div className="p-16 text-center">
                <span className="text-4xl block mb-4">📭</span>
                <p className="text-slate-600 font-semibold text-sm">No hay registros de mano de obra en este período</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-50 text-dashboard-textMuted text-[10px] uppercase tracking-wider border-b border-slate-100 sticky top-0 shadow-sm z-10">
                    <th className="px-4 py-3 font-semibold bg-slate-50">OP / Referencia</th>
                    <th className="px-4 py-3 font-semibold bg-slate-50">Actividad</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-l border-slate-200">H. Cot.</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">H. Ejec.</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">Dif Horas</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-r border-slate-200">% Horas</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">Tarifa Cot.</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-r border-slate-200">Tarifa Real</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">Ef. Horas (Jesús)</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">Ef. Tarifa (Cris)</th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-l border-slate-200">Cumplimiento Oficial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {detalle.map((d, i) => {
                    const sinCotizar = d.cant_cotizada === 0;
                    
                    // Validación cruzada
                    let invalidRow = false;
                    if (!sinCotizar && d.efecto_horas !== null && d.efecto_tarifa !== null) {
                      const suma = d.efecto_horas + d.efecto_tarifa;
                      if (Math.abs(suma - d.cumplimiento) > 100) {
                        invalidRow = true;
                      }
                    }

                    return (
                      <tr key={`${d.nro_op}-${d.referencia}-${d.actividad}-${i}`} className={`transition-colors hover:bg-slate-50/50 ${invalidRow ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-dashboard-textMain">{d.nro_op}</div>
                          <div className="text-[10px] text-dashboard-textMuted truncate max-w-[150px]" title={d.referencia}>{d.referencia}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium truncate max-w-[150px]" title={d.actividad}>{d.actividad}</td>
                        
                        {/* Horas */}
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums border-l border-slate-100">{fmtNum.format(d.cant_cotizada)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700 tabular-nums">{fmtNum.format(d.cant_ejecutada)}</td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${d.diferencia_horas > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {d.diferencia_horas > 0 ? '+' : ''}{fmtNum.format(d.diferencia_horas)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums border-r border-slate-100">
                          {sinCotizar ? (
                            <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">S/C</span>
                          ) : (
                            <span className={
                                d.diferencia_horas_pct! > 20 ? 'text-red-700 bg-red-100 px-1.5 py-0.5 rounded' : 
                                d.diferencia_horas_pct! > 0 ? 'text-amber-600' : 'text-emerald-600'
                              }>
                              {d.diferencia_horas_pct > 0 ? '+' : ''}{fmtNum.format(d.diferencia_horas_pct!)}%
                            </span>
                          )}
                        </td>
                        
                        {/* Tarifas */}
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                          {sinCotizar ? <span className="text-[10px] text-slate-400 italic">Sin cotizar</span> : fmtCOP.format(d.tarifa_cotizada!)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100">
                          {fmtCOP.format(d.tarifa_real)}
                        </td>

                        {/* Efectos */}
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${!sinCotizar && d.efecto_horas! > 0 ? 'text-red-600 bg-red-50/50' : 'text-slate-600'}`}>
                          {sinCotizar ? <span className="text-[10px] text-slate-400 italic">—</span> : fmtCOP.format(d.efecto_horas!)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${!sinCotizar && d.efecto_tarifa! > 0 ? 'text-red-600 bg-red-50/50' : 'text-slate-600'}`}>
                          {sinCotizar ? <span className="text-[10px] text-slate-400 italic">—</span> : fmtCOP.format(d.efecto_tarifa!)}
                        </td>

                        {/* Oficial */}
                        <td className="px-4 py-3 text-right font-bold tabular-nums border-l border-slate-100 bg-slate-50/50">
                          {invalidRow && (
                            <span className="text-xs text-red-500 mr-2" title={`Discrepancia en suma de efectos (Efectos: ${d.efecto_horas! + d.efecto_tarifa!})`}>⚠️</span>
                          )}
                          <span className={d.cumplimiento > 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {fmtCOP.format(d.cumplimiento)}
                          </span>
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
