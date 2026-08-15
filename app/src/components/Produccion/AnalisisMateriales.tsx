import { useState, useEffect, useMemo, Fragment } from 'react';
import { fetchAnalisisMateriales, type LineaMaterial } from '../../services/api';
import OpTrazabilidadModal from './OpTrazabilidadModal';
import InformeMaterialesPDF from './InformeMaterialesPDF';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const fmtNum4 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

export default function AnalisisMateriales() {
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [detalle, setDetalle] = useState<LineaMaterial[]>([]);
  const [totalItems, setTotalItems] = useState(0);

  const [opSeleccionada, setOpSeleccionada] = useState<string | null>(null);
  const [opFilaDesplegada, setOpFilaDesplegada] = useState<string | null>(null);
  
  const [informeAbierto, setInformeAbierto] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalisisMateriales(fechaInicio, fechaFin);
      setDetalle(data.detalle);
      setTotalItems(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fechaInicio, fechaFin]);

  const dataProcesada = useMemo(() => {
    return detalle.map(d => {
      let isAjustado = false;
      let costo_unit_cotizado: number | null = null;
      let costo_unit_ejecutado: number | null = null;
      let impacto_final = parseFloat(d.cumplimiento as any) || 0;

      if (d.op_cantidad_cotizada !== null && d.op_cantidad_cotizada > 0 && d.op_cantidad_ejecutada !== null) {
        costo_unit_cotizado = d.valor_cotizado / d.op_cantidad_cotizada;
        costo_unit_ejecutado = d.op_cantidad_ejecutada > 0 ? d.valor_ejecutado / d.op_cantidad_ejecutada : 0;
        impacto_final = (costo_unit_cotizado - costo_unit_ejecutado) * d.op_cantidad_ejecutada;
        isAjustado = true;
      }

      return {
        ...d,
        isAjustado,
        costo_unit_cotizado,
        costo_unit_ejecutado,
        impacto_final
      };
    });
  }, [detalle]);

  const groupedData = useMemo(() => {
    const groups: Record<string, { op: string, referencia: string, actividades: typeof dataProcesada, subtotalCumplimiento: number, subtotalImpacto: number }> = {};
    
    let cantidadSobrecosto = 0;
    let countSobrecosto = 0;
    
    let cantidadAhorro = 0;
    let countAhorro = 0;
    
    let casosEspeciales = 0;

    let efectoPrecioTotal = 0;

    dataProcesada.forEach(d => {
      const opKey = String(d.nro_op);
      if (!groups[opKey]) {
        groups[opKey] = {
          op: opKey,
          referencia: d.referencia,
          actividades: [],
          subtotalCumplimiento: 0,
          subtotalImpacto: 0
        };
      }
      
      groups[opKey].actividades.push(d);
      
      const pre = d.efecto_precio || 0;
      const cump = parseFloat(d.cumplimiento as any) || 0;
      const imp = d.impacto_final || 0;
      
      groups[opKey].subtotalCumplimiento += cump;
      groups[opKey].subtotalImpacto += imp;

      efectoPrecioTotal += pre;

      if (!d.calculable || d.cant_cotizada === 0 || d.cant_ejecutada === 0) {
        casosEspeciales++;
      } else {
        if (imp < 0) {
          cantidadSobrecosto += imp;
          countSobrecosto++;
        } else if (imp > 0) {
          cantidadAhorro += imp;
          countAhorro++;
        }
      }
    });

    const sortedGroups = Object.values(groups).sort((a, b) => a.subtotalCumplimiento - b.subtotalCumplimiento);
    
    sortedGroups.forEach(g => {
      g.actividades.sort((a, b) => (parseFloat(a.cumplimiento as any) || 0) - (parseFloat(b.cumplimiento as any) || 0));
    });
    
    const showBanner = dataProcesada.some(d => !d.isAjustado) && dataProcesada.length > 0;

    return {
      grupos: sortedGroups,
      metricas: {
        cantidadSobrecosto, countSobrecosto,
        cantidadAhorro, countAhorro,
        casosEspeciales,
        efectoPrecioTotal
      },
      showBanner,
      totalActividades: dataProcesada.length
    };
  }, [dataProcesada]);

  const toggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpFilaDesplegada(prev => prev === id ? null : id);
  };

  const openModal = (op: string) => {
    setOpSeleccionada(op);
  };

  const closeModal = () => {
    setOpSeleccionada(null);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-slate-50/50 pb-20">
      
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-probolsas-cyan"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>
          Análisis de Materiales — Franklin
        </h1>
        <p className="text-slate-500 mt-2 font-medium">Impacto en costos de materiales, aislando los efectos de cantidad y precio.</p>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Desde</label>
            <input 
              type="date" 
              value={fechaInicio} 
              onChange={e => setFechaInicio(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-probolsas-cyan focus:border-probolsas-cyan block px-3 py-2 outline-none font-medium transition-colors"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Hasta</label>
            <input 
              type="date" 
              value={fechaFin} 
              onChange={e => setFechaFin(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-probolsas-cyan focus:border-probolsas-cyan block px-3 py-2 outline-none font-medium transition-colors"
            />
          </div>
        </div>

        {detalle.length > 0 && (
          <button 
            onClick={() => setInformeAbierto(true)}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
            Generar Informe
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-probolsas-cyan rounded-full"></div>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 font-medium">{error}</div>
      ) : detalle.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"></path><path d="M3 16.2V21m0 0h4.8M3 21l6-6"></path><path d="M21 7.8V3m0 0h-4.8M21 3l-6 6"></path><path d="M3 7.8V3m0 0h4.8M3 3l6 6"></path></svg>
          </div>
          <p className="text-slate-500 font-medium">No se encontraron registros de materiales en este período.</p>
        </div>
      ) : (
        <div className="space-y-8">
          
          {groupedData.showBanner && (
            <div className="bg-amber-50/50 border border-amber-200 text-amber-800 p-4 rounded-xl flex gap-3 text-sm mb-6 items-start">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              <div>
                <p className="font-medium">
                  Hay Órdenes de Producción en este período sin dato de cantidades producidas. Para esas OP se muestra el cálculo bruto sin ajustar por volumen, lo cual no es preciso para medir mermas. El sistema cambiará automáticamente al método ajustado cuando la OP reciba sus datos de producción.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden group hover:border-red-200 transition-colors">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition-colors"></div>
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-2 bg-red-100 px-3 py-1 rounded-full relative z-10">Sobrecosto</span>
              <span className="text-3xl font-black text-red-600 relative z-10">
                {fmtCOP.format(groupedData.metricas.cantidadSobrecosto)}
              </span>
              <span className="text-xs text-slate-500 mt-2 font-medium relative z-10">En {groupedData.metricas.countSobrecosto} actividades de producción</span>
            </div>

            <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden group hover:border-emerald-200 transition-colors">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors"></div>
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2 bg-emerald-100 px-3 py-1 rounded-full relative z-10">Ahorro</span>
              <span className="text-3xl font-black text-emerald-600 relative z-10">
                +{fmtCOP.format(groupedData.metricas.cantidadAhorro)}
              </span>
              <span className="text-xs text-slate-500 mt-2 font-medium relative z-10">En {groupedData.metricas.countAhorro} actividades de producción</span>
            </div>

            <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden group hover:border-amber-200 transition-colors">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-colors"></div>
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2 bg-amber-100 px-3 py-1 rounded-full relative z-10">Casos Especiales</span>
              <span className="text-3xl font-black text-amber-600 relative z-10">
                {groupedData.metricas.casosEspeciales}
              </span>
              <span className="text-xs text-slate-500 mt-2 font-medium relative z-10">Sustituciones / No Cotizados / No Ejecutados</span>
            </div>

          </div>

          <div className="text-center text-sm font-medium text-slate-500 bg-slate-100/50 py-3 rounded-xl border border-slate-200/50">
            <span className="inline-block">Efecto precio: <strong className="text-slate-700">{fmtCOP.format(groupedData.metricas.efectoPrecioTotal)}</strong> (compras)</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800">Detalle por Orden de Producción</h3>
                <p className="text-xs text-slate-500 mt-0.5">{totalItems} registros procesados</p>
              </div>
            </div>

            {groupedData.grupos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                  <thead>
                    <tr className="bg-white border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3">OP / Referencia</th>
                      <th className="px-4 py-3">Material</th>
                      <th className="px-4 py-3 text-right">Cant. Cotizada</th>
                      <th className="px-4 py-3 text-right">Cant. Ejecutada</th>
                      <th className="px-4 py-3 text-right">Costo unit. cotizado</th>
                      <th className="px-4 py-3 text-right">Costo unit. ejecutado</th>
                      <th className="px-4 py-3 text-right">Vr. Cotizado</th>
                      <th className="px-4 py-3 text-right">Vr. Ejecutado</th>
                      <th className="px-4 py-3 text-right">Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedData.grupos.map((grupo, gIndex) => (
                      <Fragment key={`g-${gIndex}`}>
                        
                        <tr className="bg-slate-50/80 hover:bg-slate-100/80 transition-colors">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="flex justify-between items-center w-full">
                              <div className="flex items-center gap-3">
                                <button 
                                  onClick={() => openModal(grupo.op)}
                                  className="font-black text-base text-probolsas-cyan hover:text-cyan-700 hover:underline transition-colors flex items-center gap-1.5"
                                  title="Ver trazabilidad completa de la OP"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>
                                  {grupo.op}
                                </button>
                                <span className="text-slate-300">|</span>
                                <span className="font-medium text-slate-700 truncate max-w-xs">{grupo.referencia}</span>
                                <span className="text-xs bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded-full font-medium ml-2">
                                  {grupo.actividades.length} mat.
                                </span>
                              </div>
                              <div className="flex gap-6 items-center">
                                <span className="text-xs font-semibold text-slate-500">Subtotal OP</span>
                                <span className={`font-black ${grupo.subtotalImpacto < -100 ? 'text-red-600' : grupo.subtotalImpacto > 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                  {grupo.subtotalImpacto > 0 ? '+' : ''}{fmtCOP.format(grupo.subtotalImpacto)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {grupo.actividades.map((d, i) => {
                          const id = `${grupo.op}-${i}`;
                          const isExpanded = opFilaDesplegada === id;
                          const hasDescuadre = Math.abs((d.efecto_cantidad || 0) + (d.efecto_precio || 0) - parseFloat(d.cumplimiento as any)) > 100 && d.calculable;
                          const esNoCotizado = d.cant_cotizada === 0;
                          const esNoEjecutado = d.cant_ejecutada === 0;

                          return (
                            <Fragment key={id}>
                              <tr 
                                className={`hover:bg-slate-50 transition-colors group cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                                onClick={(e) => toggleRow(id, e)}
                              >
                                <td className="px-4 py-3">
                                  <button className={`p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all ${isExpanded ? 'rotate-180 bg-slate-200 text-slate-600' : ''}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-slate-500 opacity-50">{d.nro_op}</td>
                                <td className="px-4 py-3 text-slate-800 font-medium truncate max-w-[200px]" title={d.material}>
                                  {d.material}
                                  {esNoCotizado && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">No cotizado</span>}
                                  {esNoEjecutado && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">No ejecutado</span>}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{fmtNum4.format(d.cant_cotizada)}</td>
                                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{fmtNum4.format(d.cant_ejecutada)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{d.costo_unit_cotizado !== null ? fmtCOP.format(d.costo_unit_cotizado) : '-'}</td>
                                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{d.costo_unit_ejecutado !== null ? fmtCOP.format(d.costo_unit_ejecutado) : '-'}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{fmtCOP.format(d.valor_cotizado)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtCOP.format(d.valor_ejecutado)}</td>
                                <td className={`px-4 py-3 text-right tabular-nums font-black flex items-center justify-end gap-1 ${d.cumplimiento < -100 ? 'text-red-600' : d.cumplimiento > 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                  {hasDescuadre && (
                                    <span title="Descuadre en distribución de efectos" className="text-amber-500">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                    </span>
                                  )}
                                  {d.cumplimiento > 0 ? '+' : ''}{fmtCOP.format(d.cumplimiento)}
                                </td>
                              </tr>
                              
                              {isExpanded && (
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <td colSpan={10} className="px-14 py-4">
                                    <div className="grid grid-cols-4 gap-4">
                                      <div>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Precio Cotizado</span>
                                        <span className="font-medium text-slate-700">{d.precio_cotizado ? fmtCOP.format(d.precio_cotizado) : '-'}</span>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Precio Real</span>
                                        <span className="font-medium text-slate-700">{d.precio_real ? fmtCOP.format(d.precio_real) : '-'}</span>
                                      </div>
                                      <div className="bg-slate-100 p-2 rounded border border-slate-200">
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Efecto Cantidad</span>
                                        <span className={`font-bold ${d.efecto_cantidad && d.efecto_cantidad < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                          {d.efecto_cantidad !== null ? fmtCOP.format(d.efecto_cantidad) : '-'}
                                        </span>
                                      </div>
                                      <div className="bg-slate-100 p-2 rounded border border-slate-200">
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Efecto Precio</span>
                                        <span className={`font-bold ${d.efecto_precio && d.efecto_precio < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                          {d.efecto_precio !== null ? fmtCOP.format(d.efecto_precio) : '-'}
                                        </span>
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
              </div>
            )}
          </div>
        </div>
      )}
      
      {opSeleccionada && (
        <OpTrazabilidadModal
          nro_op={opSeleccionada}
          onClose={closeModal}
        />
      )}

      {informeAbierto && (
        <InformeMaterialesPDF
          detalle={detalle}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onClose={() => setInformeAbierto(false)}
        />
      )}
    </div>
  );
}
