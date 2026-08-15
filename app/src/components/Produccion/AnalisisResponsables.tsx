import { useState, useEffect, useMemo, Fragment } from 'react';
import { fetchAnalisisResponsables, type LineaResponsable } from '../../services/api';
import OpTrazabilidadModal from './OpTrazabilidadModal';
import InformeResponsablePDF from './InformeResponsablePDF';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  const [opSeleccionada, setOpSeleccionada] = useState<string | null>(null);
  const [informeAbierto, setInformeAbierto] = useState(false);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setOpSeleccionada(params.get('op'));
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const openModal = (nro_op: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('op', nro_op);
    window.history.pushState({}, '', url);
    setOpSeleccionada(nro_op);
  };

  const closeModal = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('op');
    window.history.pushState({}, '', url);
    setOpSeleccionada(null);
  };

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalisisResponsables(fechaInicio, fechaFin);
      setDetalle(data.detalle);
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

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupedData = useMemo(() => {
    const groups: Record<string, { op: string, referencia: string, actividades: any[], subtotalHoras: number, subtotalTarifa: number, subtotalCumplimiento: number }> = {};
    
    let jesusSobrecosto = 0, jesusAhorro = 0;
    let cristianSobrecosto = 0, cristianAhorro = 0;
    
    let countJesusSobrecosto = 0, countJesusAhorro = 0;
    let countCristianSobrecosto = 0, countCristianAhorro = 0;

    let horasJesusSobrecosto = 0, horasJesusAhorro = 0;
    let sumBaseCristianSobrecosto = 0, sumBaseCristianAhorro = 0;

    detalle.forEach(d => {
      const opKey = String(d.nro_op);
      if (!groups[opKey]) {
        groups[opKey] = {
          op: opKey,
          referencia: d.referencia,
          actividades: [],
          subtotalHoras: 0,
          subtotalTarifa: 0,
          subtotalCumplimiento: 0
        };
      }
      
      const efHoras = parseFloat(d.efecto_horas as any) || 0;
      const efTarifa = parseFloat(d.efecto_tarifa as any) || 0;
      const cumplimiento = parseFloat(d.cumplimiento as any) || 0;
      
      groups[opKey].actividades.push(d);
      groups[opKey].subtotalHoras += efHoras;
      groups[opKey].subtotalTarifa += efTarifa;
      groups[opKey].subtotalCumplimiento += cumplimiento;

      const difHoras = (parseFloat(d.cant_ejecutada as any) || 0) - (parseFloat(d.cant_cotizada as any) || 0);
      const baseTarifa = (parseFloat(d.tarifa_cotizada as any) || 0) * (parseFloat(d.cant_ejecutada as any) || 0);

      if (efHoras < 0) {
        jesusSobrecosto += efHoras;
        countJesusSobrecosto++;
        horasJesusSobrecosto += difHoras;
      } else if (efHoras > 0) {
        jesusAhorro += efHoras;
        countJesusAhorro++;
        horasJesusAhorro += difHoras;
      }

      if (efTarifa < 0) {
        cristianSobrecosto += efTarifa;
        countCristianSobrecosto++;
        sumBaseCristianSobrecosto += baseTarifa;
      } else if (efTarifa > 0) {
        cristianAhorro += efTarifa;
        countCristianAhorro++;
        sumBaseCristianAhorro += baseTarifa;
      }
    });

    const sortedGroups = Object.values(groups).sort((a, b) => a.subtotalCumplimiento - b.subtotalCumplimiento);
    
    sortedGroups.forEach(g => {
      g.actividades.sort((a, b) => (parseFloat(a.cumplimiento as any) || 0) - (parseFloat(b.cumplimiento as any) || 0));
    });
    
    return {
      grupos: sortedGroups,
      metricas: {
        jesusSobrecosto, jesusAhorro,
        cristianSobrecosto, cristianAhorro,
        countJesusSobrecosto, countJesusAhorro,
        countCristianSobrecosto, countCristianAhorro,
        horasJesusSobrecosto, horasJesusAhorro,
        sumBaseCristianSobrecosto, sumBaseCristianAhorro,
      },
      totalActividades: detalle.length
    };
  }, [detalle]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      
      {/* Header */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0 flex flex-wrap gap-4 justify-between items-end print:hidden">
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
          <button 
            onClick={() => setInformeAbierto(true)}
            className="ml-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-colors self-end"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 18H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9l5 5v2"></path><rect x="14" y="14" width="8" height="8" rx="2"></rect><line x1="18" y1="14" x2="18" y2="22"></line><line x1="14" y1="18" x2="22" y2="18"></line></svg>
            Generar Informe
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 flex flex-col gap-6 print:hidden">

        {/* Tarjetas de Métricas Separadas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Jesús Sobrecosto */}
          <div className="bg-red-50/50 p-5 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-2 bg-red-100 px-3 py-1 rounded-full">Efecto Horas (Líder de Producción) · Sobrecosto</span>
            <span className="text-3xl font-black text-red-600">
              {fmtCOP.format(groupedData.metricas.jesusSobrecosto)}
            </span>
            <span className="text-xs text-slate-500 mt-2 font-medium">En {groupedData.metricas.countJesusSobrecosto} de {groupedData.totalActividades} actividades</span>
            <span className="text-[10px] text-slate-400 mt-1 font-semibold">+{fmtNum.format(groupedData.metricas.horasJesusSobrecosto)} horas de más</span>
          </div>

          {/* Jesús Ahorro */}
          <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2 bg-emerald-100 px-3 py-1 rounded-full">Efecto Horas (Líder de Producción) · Ahorro</span>
            <span className="text-3xl font-black text-emerald-600">
              +{fmtCOP.format(groupedData.metricas.jesusAhorro)}
            </span>
            <span className="text-xs text-slate-500 mt-2 font-medium">En {groupedData.metricas.countJesusAhorro} de {groupedData.totalActividades} actividades</span>
            <span className="text-[10px] text-slate-400 mt-1 font-semibold">{fmtNum.format(groupedData.metricas.horasJesusAhorro)} horas</span>
          </div>
          
          {/* Cristian Sobrecosto */}
          <div className="bg-red-50/50 p-5 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-2 bg-red-100 px-3 py-1 rounded-full">Efecto Tarifa (Costeo y Presupuesto) · Sobrecosto</span>
            <span className="text-3xl font-black text-red-600">
              {fmtCOP.format(groupedData.metricas.cristianSobrecosto)}
            </span>
            <span className="text-xs text-slate-500 mt-2 font-medium">En {groupedData.metricas.countCristianSobrecosto} de {groupedData.totalActividades} actividades</span>
            <span className="text-[10px] text-slate-400 mt-1 font-semibold">tarifa real +{groupedData.metricas.sumBaseCristianSobrecosto ? fmtNum.format(-groupedData.metricas.cristianSobrecosto / groupedData.metricas.sumBaseCristianSobrecosto * 100) : 0}% sobre la cotizada</span>
          </div>

          {/* Cristian Ahorro */}
          <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2 bg-emerald-100 px-3 py-1 rounded-full">Efecto Tarifa (Costeo y Presupuesto) · Ahorro</span>
            <span className="text-3xl font-black text-emerald-600">
              +{fmtCOP.format(groupedData.metricas.cristianAhorro)}
            </span>
            <span className="text-xs text-slate-500 mt-2 font-medium">En {groupedData.metricas.countCristianAhorro} de {groupedData.totalActividades} actividades</span>
            <span className="text-[10px] text-slate-400 mt-1 font-semibold">tarifa real {groupedData.metricas.sumBaseCristianAhorro ? fmtNum.format(-groupedData.metricas.cristianAhorro / groupedData.metricas.sumBaseCristianAhorro * 100) : 0}% sobre la cotizada</span>
          </div>

        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
          
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="text-sm font-semibold text-dashboard-textMain">Detalle de Variaciones por OP (Mano de Obra)</h3>
            <span className="text-xs text-dashboard-textMuted">Ordenadas por mayor impacto en sobrecostos.</span>
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
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-l border-slate-200">
                      H. Cot. <i className="ti ti-help-circle text-slate-400 ml-0.5 cursor-help" title="horas presupuestadas vs realmente trabajadas"></i>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">
                      H. Ejec. <i className="ti ti-help-circle text-slate-400 ml-0.5 cursor-help" title="horas presupuestadas vs realmente trabajadas"></i>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-r border-slate-200">
                      % Horas <i className="ti ti-help-circle text-slate-400 ml-0.5 cursor-help" title="la misma diferencia en porcentaje. Útil para comparar actividades de distinto tamaño"></i>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">
                      Ef. Horas (Líder de Producción) <i className="ti ti-help-circle text-slate-400 ml-0.5 cursor-help" title="impacto en pesos por trabajar más o menos horas de las previstas, valorado a la tarifa cotizada. Responsabilidad de planta"></i>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50">
                      Ef. Tarifa (Costeo y Presupuesto) <i className="ti ti-help-circle text-slate-400 ml-0.5 cursor-help" title="impacto en pesos porque la tarifa real difiere de la presupuestada. Responsabilidad del costeo"></i>
                    </th>
                    <th className="px-4 py-3 font-semibold text-right bg-slate-50 border-l border-slate-200">
                      Cumplimiento Oficial <i className="ti ti-help-circle text-slate-400 ml-0.5 cursor-help" title="valor que reporta Crisolweb. Sirve de control: Ef. Horas + Ef. Tarifa debe dar exactamente este número"></i>
                    </th>
                    <th className="w-10 px-4 py-3 bg-slate-50 border-l border-slate-100"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {groupedData.grupos.map((g) => (
                    <Fragment key={g.op}>
                      {/* OP Group Header */}
                      <tr className="bg-slate-100/60 border-t-2 border-slate-200">
                        <td colSpan={2} className="px-4 py-2 font-semibold text-slate-700 cursor-pointer hover:text-probolsas-cyan" onClick={() => openModal(g.op)}>
                          <span className="underline decoration-dotted underline-offset-4">OP {g.op}</span> <span className="text-slate-400 font-normal ml-1 mr-1">·</span> <span className="text-xs text-slate-500">{g.actividades.length} actividades</span>
                          <div className="text-[10px] text-slate-500 font-normal truncate max-w-[250px] mt-0.5">{g.referencia}</div>
                        </td>
                        <td colSpan={3} className="px-4 py-2 text-right border-l border-slate-200/50">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mr-3">Subtotal MO</span>
                        </td>
                        <td className={`px-4 py-2 text-right font-bold tabular-nums ${g.subtotalHoras < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmtCOP.format(g.subtotalHoras)}
                        </td>
                        <td className={`px-4 py-2 text-right font-bold tabular-nums ${g.subtotalTarifa < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmtCOP.format(g.subtotalTarifa)}
                        </td>
                        <td className={`px-4 py-2 text-right font-black tabular-nums border-l border-slate-200/50 ${g.subtotalCumplimiento < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmtCOP.format(g.subtotalCumplimiento)}
                        </td>
                        <td className="px-4 py-2 border-l border-slate-100/50"></td>
                      </tr>

                      {/* Activities inside OP */}
                      {g.actividades.map((d, i) => {
                        const sinCotizar = parseFloat(d.cant_cotizada as any) === 0;
                        const efHoras = parseFloat(d.efecto_horas as any) || 0;
                        const efTarifa = parseFloat(d.efecto_tarifa as any) || 0;
                        const cumplimiento = parseFloat(d.cumplimiento as any) || 0;
                        const rowKey = `${d.nro_op}-${d.actividad}-${i}`;
                        const isExpanded = expandedRows.has(rowKey);
                        
                        let invalidRow = false;
                        if (!sinCotizar && !isNaN(efHoras) && !isNaN(efTarifa)) {
                          const suma = efHoras + efTarifa;
                          if (Math.abs(suma - cumplimiento) > 100) invalidRow = true;
                        }

                        return (
                          <Fragment key={rowKey}>
                            <tr className={`transition-colors hover:bg-slate-50/50 ${invalidRow ? 'bg-red-50' : ''}`}>
                              <td className="px-4 py-3 pl-8 text-slate-400 border-l-2 border-transparent">
                                ↳
                              </td>
                              <td className="px-4 py-3 text-slate-700 font-medium truncate max-w-[200px]" title={d.actividad}>{d.actividad}</td>
                              
                              <td className="px-4 py-3 text-right text-slate-500 tabular-nums border-l border-slate-100">{fmtNum.format(d.cant_cotizada)}</td>
                              <td className="px-4 py-3 text-right font-medium text-slate-700 tabular-nums">{fmtNum.format(d.cant_ejecutada)}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums border-r border-slate-100">
                                {sinCotizar ? (
                                  <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">S/C</span>
                                ) : (
                                  <span className={
                                      (d.diferencia_horas_pct ?? 0) > 20 ? 'text-red-700 bg-red-100 px-1.5 py-0.5 rounded' : 
                                      (d.diferencia_horas_pct ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                                    }>
                                    {(d.diferencia_horas_pct ?? 0) > 0 ? '+' : ''}{fmtNum.format(d.diferencia_horas_pct ?? 0)}%
                                  </span>
                                )}
                              </td>
                              
                              <td className={`px-4 py-3 text-right font-bold tabular-nums ${!sinCotizar && efHoras < 0 ? 'text-red-600 bg-red-50/50' : 'text-slate-600'}`}>
                                {sinCotizar ? <span className="text-[10px] text-slate-400 italic">—</span> : fmtCOP.format(efHoras)}
                              </td>
                              <td className={`px-4 py-3 text-right font-bold tabular-nums ${!sinCotizar && efTarifa < 0 ? 'text-red-600 bg-red-50/50' : 'text-slate-600'}`}>
                                {sinCotizar ? <span className="text-[10px] text-slate-400 italic">—</span> : fmtCOP.format(efTarifa)}
                              </td>
                              
                              <td className="px-4 py-3 text-right font-bold tabular-nums border-l border-slate-100 bg-slate-50/50">
                                {invalidRow && (
                                  <span className="text-xs text-red-500 mr-2" title={`Discrepancia en suma de efectos (Efectos: ${efHoras + efTarifa})`}>⚠️</span>
                                )}
                                <span className={cumplimiento < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                  {fmtCOP.format(cumplimiento)}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-center cursor-pointer text-slate-400 hover:text-probolsas-cyan border-l border-slate-100" onClick={() => toggleRow(rowKey)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </td>
                            </tr>
                            
                            {/* Expanded Details */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80 shadow-inner">
                                <td colSpan={2} className="border-l-2 border-probolsas-cyan bg-slate-100"></td>
                                <td colSpan={7} className="px-8 py-4 border-l border-slate-200/50 bg-white shadow-sm rounded-br-lg">
                                  <div className="flex gap-16 text-sm">
                                    <div>
                                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Diferencia Horas Absoluta</span>
                                      <span className={`font-bold ${parseFloat(d.diferencia_horas as any) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {parseFloat(d.diferencia_horas as any) > 0 ? '+' : ''}{fmtNum.format(d.diferencia_horas)} h
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Tarifa Cotizada</span>
                                      <span className="font-medium text-slate-700">
                                        {sinCotizar ? <span className="italic text-slate-400 text-xs">Sin cotizar</span> : fmtCOP.format(d.tarifa_cotizada!)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Tarifa Real</span>
                                      <span className="font-medium text-slate-700">{fmtCOP.format(d.tarifa_real)}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      
      {opSeleccionada && (
        <OpTrazabilidadModal
          nro_op={opSeleccionada}
          onClose={closeModal}
        />
      )}

      {informeAbierto && (
        <InformeResponsablePDF
          detalle={detalle}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onClose={() => setInformeAbierto(false)}
        />
      )}
    </div>
  );
}
