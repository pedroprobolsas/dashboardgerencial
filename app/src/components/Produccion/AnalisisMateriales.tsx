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
  const [filtroEspecial, setFiltroEspecial] = useState<'alias' | 'cotizado_sin_usar' | 'sustitucion' | 'consumo_extra' | null>(null);
  
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
    const getWords = (name: string) => {
      return name.toLowerCase().split(/[^a-z0-9ñáéíóúü]+/i).filter(w => w.length >= 3);
    };

    const hasSharedWord = (name1: string, name2: string) => {
      const words1 = getWords(name1);
      const words2 = getWords(name2);
      return words1.some(w => words2.includes(w));
    };

    const basicData = detalle.map(d => {
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

      // Prevenir NaN por comas en strings
      const parseNum = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        return Number(String(val).replace(',', '.'));
      };

      return {
        ...d,
        cant_cotizada: parseNum(d.cant_cotizada),
        cant_ejecutada: parseNum(d.cant_ejecutada),
        isAjustado,
        costo_unit_cotizado,
        costo_unit_ejecutado,
        impacto_final,
        tipo_especial: 'normal' as 'normal' | 'alias' | 'cotizado_sin_usar' | 'sustitucion' | 'consumo_extra' | null,
        par_id: undefined as string | undefined
      };
    });

    const byOp: Record<string, typeof basicData> = {};
    basicData.forEach(d => {
      const opKey = String(d.nro_op).trim();
      if (!byOp[opKey]) byOp[opKey] = [];
      byOp[opKey].push(d);
    });

    const result: typeof basicData = [];

    for (const op in byOp) {
      const items = byOp[op];
      const soloCot = items.filter(d => d.cant_cotizada > 0 && d.cant_ejecutada <= 0.001);
      const soloEjec = items.filter(d => d.cant_cotizada <= 0.001 && d.cant_ejecutada > 0);
      
      const matchedCot = new Set();
      const matchedEjec = new Set();

      // 1. Encontrar Alias (Palabra compartida y ±5%)
      for (const c of soloCot) {
        if (matchedCot.has(c)) continue;
        for (const e of soloEjec) {
          if (matchedEjec.has(e)) continue;
          if (hasSharedWord(c.material, e.material)) {
            const diff = Math.abs(e.cant_ejecutada - c.cant_cotizada) / c.cant_cotizada;
            if (diff < 0.05) {
              c.tipo_especial = 'alias';
              e.tipo_especial = 'alias';
              c.par_id = e.material;
              e.par_id = c.material;
              matchedCot.add(c);
              matchedEjec.add(e);
              break;
            }
          }
        }
      }

      // 2. Encontrar Sustitución Real (Palabra compartida pero fuera de ±5%)
      for (const c of soloCot) {
        if (matchedCot.has(c)) continue;
        for (const e of soloEjec) {
          if (matchedEjec.has(e)) continue;
          if (hasSharedWord(c.material, e.material)) {
            c.tipo_especial = 'sustitucion';
            e.tipo_especial = 'sustitucion';
            c.par_id = e.material;
            e.par_id = c.material;
            matchedCot.add(c);
            matchedEjec.add(e);
            break;
          }
        }
      }

      // 3. Marcar los restantes
      for (const c of soloCot) {
        if (!matchedCot.has(c)) {
          c.tipo_especial = 'cotizado_sin_usar';
        }
      }
      for (const e of soloEjec) {
        if (!matchedEjec.has(e)) {
          e.tipo_especial = 'consumo_extra';
        }
      }

      result.push(...items);
    }

    return result;
  }, [detalle]);

  const groupedData = useMemo(() => {
    const groups: Record<string, { op: string, referencia: string, actividades: typeof dataProcesada, subtotalCumplimiento: number, subtotalImpacto: number }> = {};
    
    let cantidadSobrecosto = 0;
    let countSobrecosto = 0;
    
    let cantidadAhorro = 0;
    let countAhorro = 0;
    
    let cantidadAlias = 0;
    let countAliasPares = 0;
    
    let cantidadCotizadoSinUsar = 0;
    let countCotizadoSinUsar = 0;
    
    let cantidadSustitucion = 0;
    let countSustitucion = 0;

    let cantidadConsumoExtra = 0;
    let countConsumoExtra = 0;

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

      if (d.tipo_especial === 'alias') {
        cantidadAlias += imp;
        if (d.cant_ejecutada > 0) countAliasPares++;
      } else if (d.tipo_especial === 'cotizado_sin_usar') {
        cantidadCotizadoSinUsar += d.valor_cotizado;
        countCotizadoSinUsar++;
      } else if (d.tipo_especial === 'sustitucion') {
        cantidadSustitucion += imp;
        if (d.cant_ejecutada > 0) countSustitucion++;
      } else if (d.tipo_especial === 'consumo_extra') {
        cantidadConsumoExtra += imp;
        countConsumoExtra++;
      } else if (!d.calculable) {
        // Fallback si no es calculable pero no encajó en los anteriores
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
        cantidadAlias, countAliasPares,
        cantidadCotizadoSinUsar, countCotizadoSinUsar,
        cantidadSustitucion, countSustitucion,
        cantidadConsumoExtra, countConsumoExtra,
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
          Análisis de Materiales — Líder de Bodega
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

          {groupedData.metricas.countAliasPares > 0 && (
            <div className="bg-indigo-50/80 border border-indigo-200 text-indigo-800 p-4 rounded-xl flex gap-3 text-sm mb-6 items-start">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <div>
                <p className="font-medium">
                  Se detectaron {groupedData.metricas.countAliasPares} pares de materiales con nombre distinto entre cotización y ejecución. Esto distorsiona el análisis — conviene unificar el catálogo en Crisolweb.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            
            <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden group hover:border-red-200 transition-colors">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition-colors"></div>
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-2 bg-red-100 px-3 py-1 rounded-full relative z-10">Sobrecosto</span>
              <span className="text-3xl font-black text-red-600 relative z-10">
                {fmtCOP.format(groupedData.metricas.cantidadSobrecosto)}
              </span>
              <span className="text-xs text-slate-500 mt-2 font-medium relative z-10">En {groupedData.metricas.countSobrecosto} materiales</span>
            </div>

            <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden group hover:border-emerald-200 transition-colors">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors"></div>
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2 bg-emerald-100 px-3 py-1 rounded-full relative z-10">Ahorro</span>
              <span className="text-3xl font-black text-emerald-600 relative z-10">
                +{fmtCOP.format(groupedData.metricas.cantidadAhorro)}
              </span>
              <span className="text-xs text-slate-500 mt-2 font-medium relative z-10">En {groupedData.metricas.countAhorro} materiales</span>
            </div>

          </div>

          <div className="mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-200/60">
            <h3 className="text-sm font-bold text-slate-700 mb-4 tracking-tight flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
              Calidad del registro (Casos Especiales)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <button 
                onClick={() => setFiltroEspecial(filtroEspecial === 'alias' ? null : 'alias')}
                className={`bg-white p-4 rounded-xl border text-left flex flex-col items-start transition-all ${filtroEspecial === 'alias' ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-sm' : 'border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${filtroEspecial === 'alias' ? 'text-indigo-700' : 'text-slate-500'}`}>Alias de Catálogo</span>
                <span className="text-xl font-black text-slate-800">{fmtCOP.format(groupedData.metricas.cantidadAlias)}</span>
                <span className="text-xs text-slate-400 font-medium mt-1">{groupedData.metricas.countAliasPares} pares detectados</span>
              </button>

              <button 
                onClick={() => setFiltroEspecial(filtroEspecial === 'cotizado_sin_usar' ? null : 'cotizado_sin_usar')}
                className={`bg-white p-4 rounded-xl border text-left flex flex-col items-start transition-all ${filtroEspecial === 'cotizado_sin_usar' ? 'border-sky-400 ring-2 ring-sky-100 shadow-sm' : 'border-slate-200 hover:border-sky-200 hover:bg-sky-50/30'}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${filtroEspecial === 'cotizado_sin_usar' ? 'text-sky-700' : 'text-slate-500'}`}>Cotizado sin usar</span>
                <span className="text-xl font-black text-slate-800">{fmtCOP.format(groupedData.metricas.cantidadCotizadoSinUsar)}</span>
                <span className="text-xs text-slate-400 font-medium mt-1">En {groupedData.metricas.countCotizadoSinUsar} materiales</span>
              </button>

              <button 
                onClick={() => setFiltroEspecial(filtroEspecial === 'sustitucion' ? null : 'sustitucion')}
                className={`bg-white p-4 rounded-xl border text-left flex flex-col items-start transition-all ${filtroEspecial === 'sustitucion' ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm' : 'border-slate-200 hover:border-amber-200 hover:bg-amber-50/30'}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${filtroEspecial === 'sustitucion' ? 'text-amber-700' : 'text-slate-500'}`}>Sustitución Real</span>
                <span className="text-xl font-black text-slate-800">{fmtCOP.format(groupedData.metricas.cantidadSustitucion)}</span>
                <span className="text-xs text-slate-400 font-medium mt-1">En {groupedData.metricas.countSustitucion} materiales/pares</span>
              </button>

              <button 
                onClick={() => setFiltroEspecial(filtroEspecial === 'consumo_extra' ? null : 'consumo_extra')}
                className={`bg-white p-4 rounded-xl border text-left flex flex-col items-start transition-all ${filtroEspecial === 'consumo_extra' ? 'border-rose-400 ring-2 ring-rose-100 shadow-sm' : 'border-slate-200 hover:border-rose-200 hover:bg-rose-50/30'}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${filtroEspecial === 'consumo_extra' ? 'text-rose-700' : 'text-slate-500'}`}>Consumo no presup.</span>
                <span className="text-xl font-black text-slate-800">{fmtCOP.format(groupedData.metricas.cantidadConsumoExtra)}</span>
                <span className="text-xs text-slate-400 font-medium mt-1">En {groupedData.metricas.countConsumoExtra} materiales</span>
              </button>

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
                      <th className="px-2 py-3 w-8"></th>
                      <th className="px-2 py-3">OP / Referencia</th>
                      <th className="px-2 py-3">Material</th>
                      <th className="px-2 py-3 text-right">Cant. Cot</th>
                      <th className="px-2 py-3 text-right">Cant. Ejec</th>
                      <th className="px-2 py-3 text-right">Costo u. cot</th>
                      <th className="px-2 py-3 text-right">Costo u. ejec</th>
                      <th className="px-2 py-3 text-right">Vr. Cot</th>
                      <th className="px-2 py-3 text-right">Vr. Ejec</th>
                      <th className="px-2 py-3 text-right">Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedData.grupos.map((grupo, gIndex) => {
                      const actividadesFiltradas = filtroEspecial 
                        ? grupo.actividades.filter(a => a.tipo_especial === filtroEspecial)
                        : grupo.actividades;

                      if (actividadesFiltradas.length === 0) return null;

                      const firstAjustado = grupo.actividades.find(a => a.isAjustado);
                      let txtVolumen = null;
                      if (firstAjustado && Math.abs(grupo.subtotalImpacto - grupo.subtotalCumplimiento) > 0.01) {
                        const cantEjecutada = firstAjustado.op_cantidad_ejecutada || 0;
                        const cantCotizada = firstAjustado.op_cantidad_cotizada || 0;
                        const difUnd = cantEjecutada - cantCotizada;
                        const txtUnd = difUnd >= 0 ? `${fmtNum4.format(difUnd)} und. de más` : `${fmtNum4.format(-difUnd)} und. menos`;
                        const efectoVolumen = grupo.subtotalImpacto - grupo.subtotalCumplimiento;
                        txtVolumen = `Bruto ${grupo.subtotalCumplimiento < 0 ? '-' : ''}${fmtCOP.format(Math.abs(grupo.subtotalCumplimiento))} · efecto volumen ${efectoVolumen > 0 ? '+' : ''}${fmtCOP.format(efectoVolumen)} (${txtUnd})`;
                      }

                      return (
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
                                  {actividadesFiltradas.length} mat.
                                </span>
                              </div>
                              <div className="flex flex-col items-end">
                                <div className="flex gap-6 items-center">
                                  <span className="text-xs font-semibold text-slate-500">Subtotal OP</span>
                                  <span className={`font-black ${grupo.subtotalImpacto < -100 ? 'text-red-600' : grupo.subtotalImpacto > 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {grupo.subtotalImpacto > 0 ? '+' : ''}{fmtCOP.format(grupo.subtotalImpacto)}
                                  </span>
                                </div>
                                {txtVolumen && (
                                  <span className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                    {txtVolumen}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {actividadesFiltradas.map((d, i) => {
                          const id = `${grupo.op}-${i}`;
                          const isExpanded = opFilaDesplegada === id;
                          const hasDescuadre = Math.abs((d.efecto_cantidad || 0) + (d.efecto_precio || 0) - parseFloat(d.cumplimiento as any)) > 500 && d.calculable;
                          
                          let tag = null;
                          if (d.tipo_especial === 'alias') tag = <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">Alias</span>;
                          else if (d.tipo_especial === 'cotizado_sin_usar') tag = <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">Cotizado sin usar</span>;
                          else if (d.tipo_especial === 'sustitucion') tag = <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Sustitución</span>;
                          else if (d.tipo_especial === 'consumo_extra') tag = <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Consumo extra</span>;

                          return (
                            <Fragment key={id}>
                              <tr 
                                className={`hover:bg-slate-50 transition-colors group cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                                onClick={(e) => toggleRow(id, e)}
                              >
                                <td className="px-2 py-3">
                                  <button className={`p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all ${isExpanded ? 'rotate-180 bg-slate-200 text-slate-600' : ''}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                  </button>
                                </td>
                                <td className="px-2 py-3 text-slate-500 opacity-50">{d.nro_op}</td>
                                <td className="px-2 py-3 text-slate-800 font-medium truncate max-w-[200px]" title={d.material}>
                                  {d.material}
                                  {tag}
                                </td>
                                <td className="px-2 py-3 text-right tabular-nums text-slate-500">{fmtNum4.format(d.cant_cotizada)}</td>
                                <td className="px-2 py-3 text-right tabular-nums font-medium text-slate-800">{fmtNum4.format(d.cant_ejecutada)}</td>
                                <td className="px-2 py-3 text-right tabular-nums text-slate-500">{d.costo_unit_cotizado !== null ? fmtCOP.format(d.costo_unit_cotizado) : '-'}</td>
                                <td className="px-2 py-3 text-right tabular-nums font-medium text-slate-800">{d.costo_unit_ejecutado !== null ? fmtCOP.format(d.costo_unit_ejecutado) : '-'}</td>
                                <td className="px-2 py-3 text-right tabular-nums text-slate-500">{fmtCOP.format(d.valor_cotizado)}</td>
                                <td className="px-2 py-3 text-right tabular-nums text-slate-700">{fmtCOP.format(d.valor_ejecutado)}</td>
                                <td className={`px-2 py-3 text-right tabular-nums font-black flex items-center justify-end gap-1 ${d.cumplimiento < -100 ? 'text-red-600' : (d.cumplimiento > 100 && d.tipo_especial === 'normal') ? 'text-emerald-600' : 'text-slate-600'}`}>
                                  {hasDescuadre && (
                                    <div className="relative group/tooltip flex items-center">
                                      <span className="text-amber-500 cursor-help">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                      </span>
                                      <div className="absolute right-0 bottom-full mb-1 hidden group-hover/tooltip:block w-48 p-2 bg-slate-800 text-white text-[10px] leading-tight font-normal rounded shadow-xl z-50 whitespace-normal text-left">
                                        Hay un descuadre entre los efectos calculados y el cumplimiento total que viene del sistema de costos. Revisar directamente en el OP.
                                      </div>
                                    </div>
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
                    );
                    })}
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
