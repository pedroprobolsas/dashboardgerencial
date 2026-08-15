import { useEffect, useState } from 'react';
import { fetchCostoPorOrdenDetalle, type OPDetalleData } from '../../services/api';
import InformePDFModal from './InformePDFModal';

interface Props {
  nro_op: string;
  onClose: () => void;
}

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatMoney = (val: number | null | undefined) => {
  if (val == null || val === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return fmtCOP.format(val);
};

const formatNumber = (val: number | null | undefined) => {
  if (val == null || val === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(val);
};

const formatPct = (val: number | null | undefined) => {
  if (val == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const sign = val > 0 ? '+' : '';
  return `${sign}${val}%`;
};

const shortName = (name: string, max: number = 30) => {
  if (!name) return '';
  return name.length > max ? name.substring(0, max).trim() + '…' : name;
};

export default function OpTrazabilidadModal({ nro_op, onClose }: Props) {
  const [data, setData] = useState<OPDetalleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [informeAbierto, setInformeAbierto] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCostoPorOrdenDetalle(nro_op)
      .then(res => {
        if (active) setData(res);
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [nro_op]);

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Esc to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-xl shadow-xl flex items-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-probolsas-navy border-t-transparent rounded-full" />
          <span>Cargando detalle de OP {nro_op}...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handleBackdropClick}>
        <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full">
          <h3 className="text-lg font-bold text-red-600 mb-2">Error al cargar</h3>
          <p className="text-slate-600 mb-4">{error || 'No se encontró la información de la OP.'}</p>
          <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium py-2 rounded-lg">Cerrar</button>
        </div>
      </div>
    );
  }

  const { cabecera, detalle } = data;

  const manoObra = detalle.filter(d => d.categoria === 'mano_obra');
  const materiales = detalle.filter(d => d.categoria === 'material');
  const terceros = detalle.filter(d => d.categoria === 'tercero');

  // Cálculos resumen (parseando a float porque Postgres devuelve numeric como string)
  const sumaHoras = manoObra.reduce((sum, r) => sum + (parseFloat(r.efecto_horas as any) || 0), 0);
  const sumaTarifa = manoObra.reduce((sum, r) => sum + (parseFloat(r.efecto_tarifa as any) || 0), 0);
  
  const opCantCot = parseFloat(cabecera.op_cantidad_cotizada as any);
  const opCantEjec = parseFloat(cabecera.op_cantidad_ejecutada as any);
  const hasVolumen = !isNaN(opCantCot) && opCantCot > 0 && !isNaN(opCantEjec);

  let sumaMaterialesCantidad = 0;
  let sumaMaterialesPrecio = 0;

  const materialesProcesados = materiales.map(r => {
    let valCot = parseFloat(r.valor_cotizado as any) || 0;
    let valEjec = parseFloat(r.valor_ejecutado as any) || 0;
    let cumplimiento = parseFloat(r.cumplimiento as any) || 0;
    let efectoPrecio = parseFloat(r.efecto_tarifa as any) || 0; // Para materiales, la tarifa calculada por DB es el precio

    let costo_unit_cotizado: number | null = null;
    let costo_unit_ejecutado: number | null = null;
    let impacto_final = cumplimiento;

    if (hasVolumen) {
      costo_unit_cotizado = valCot / opCantCot;
      costo_unit_ejecutado = opCantEjec > 0 ? valEjec / opCantEjec : 0;
      impacto_final = (costo_unit_cotizado - costo_unit_ejecutado) * opCantEjec;
    }

    let efectoCantidad = impacto_final - efectoPrecio;

    sumaMaterialesPrecio += efectoPrecio;
    sumaMaterialesCantidad += efectoCantidad;

    return {
      ...r,
      costo_unit_cotizado,
      costo_unit_ejecutado,
      impacto_final,
      efecto_cantidad: efectoCantidad,
      efecto_precio: efectoPrecio
    };
  });

  const fletesPendientes = terceros.reduce((sum, r) => sum + ((parseFloat(r.valor_ejecutado as any) || 0) === 0 ? (parseFloat(r.valor_cotizado as any) || 0) : 0), 0);

  // Formatear fecha
  const fechaFormateada = new Date(cabecera.fecha).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).replace('.', ''); // remover punto de 'ago.' si existe

  // -------------------------------------------------------------
  // LÓGICA DE RESUMEN E IMPACTO (Bloques A, B y C)
  // -------------------------------------------------------------
  const impactos: { label: string, valor: number, tipo: string, contexto?: string }[] = [
    { label: 'Efecto Horas (Líder de Producción)', valor: sumaHoras, tipo: 'horas' },
    { label: 'Efecto Tarifa (Costeo y Presupuesto)', valor: sumaTarifa, tipo: 'tarifa' },
    { label: 'Consumo Materiales (Líder de Bodega)', valor: sumaMaterialesCantidad, tipo: 'consumo' },
    { label: 'Precio Materiales (Compras)', valor: sumaMaterialesPrecio, tipo: 'precio' }
  ];

  const totalImpacto = sumaHoras + sumaTarifa + sumaMaterialesCantidad + sumaMaterialesPrecio;
  
  // Ordenar impactos por magnitud absoluta (para el bloque B)
  const impactosOrdenados = [...impactos].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const maxImpacto = Math.abs(impactosOrdenados[0]?.valor || 0);

  // Generar texto resumen (Bloque A)
  let textoResumen = "";
  if (totalImpacto < 0) { // Sobrecosto
    const cat1 = impactosOrdenados[0];
    const cat2 = impactosOrdenados[1];
    
    textoResumen = `La orden costó ${fmtCOP.format(Math.abs(totalImpacto))} más de lo presupuestado. El grueso vino de ${cat1.label.split('(')[0].trim()}: ${fmtCOP.format(Math.abs(cat1.valor))}.`;
    
    // Solo agregar la segunda categoría si supera el 15% del total del sobrecosto
    if (cat2 && cat2.valor < 0 && Math.abs(cat2.valor) > Math.abs(totalImpacto) * 0.15) {
      textoResumen += ` ${cat2.label.split('(')[0].trim()} aportó ${fmtCOP.format(Math.abs(cat2.valor))}.`;
    }
  } else { // Ahorro
    const cat1 = impactosOrdenados[0];
    textoResumen = `La orden cerró ${fmtCOP.format(totalImpacto)} por debajo del presupuesto, principalmente por ${cat1.label.split('(')[0].trim()}.`;
  }

  // Generar líneas de contexto (Bloque B)
  impactosOrdenados.forEach(imp => {
    if (imp.tipo === 'precio') {
      const matsOrdenados = [...materialesProcesados]
        .filter(m => m.costo_unit_cotizado && m.costo_unit_ejecutado && m.costo_unit_ejecutado > m.costo_unit_cotizado)
        .sort((a, b) => ((b.costo_unit_ejecutado! - b.costo_unit_cotizado!) / b.costo_unit_cotizado!) - ((a.costo_unit_ejecutado! - a.costo_unit_cotizado!) / a.costo_unit_cotizado!));
      
      if (matsOrdenados.length > 0) {
        const top1 = matsOrdenados[0];
        const top2 = matsOrdenados[1];
        const pct1 = Math.round(((top1.costo_unit_ejecutado! - top1.costo_unit_cotizado!) / top1.costo_unit_cotizado!) * 100);
        let ctx = `${shortName(top1.item)} +${pct1}%`;
        if (top2) {
          const pct2 = Math.round(((top2.costo_unit_ejecutado! - top2.costo_unit_cotizado!) / top2.costo_unit_cotizado!) * 100);
          ctx += ` y ${shortName(top2.item)} +${pct2}%`;
        }
        ctx += " sobre el precio cotizado";
        imp.contexto = ctx;
      }
    } else if (imp.tipo === 'consumo') {
      if (hasVolumen) {
        if (opCantEjec > opCantCot) {
          imp.contexto = `Ya descontadas las ${new Intl.NumberFormat('es-CO').format(opCantEjec - opCantCot)} unidades producidas de más`;
        } else {
          imp.contexto = "Ajustado al volumen producido";
        }
      } else {
        imp.contexto = "Sin ajuste por volumen — falta dato de cantidades";
      }
    } else if (imp.tipo === 'tarifa') {
      const actSobrecosto = manoObra.filter(m => (m.efecto_tarifa || 0) < 0);
      if (actSobrecosto.length > 0) {
        const base = actSobrecosto.reduce((sum, r) => {
          const tarifaCot = r.cant_cotizada > 0 ? (r.valor_cotizado / r.cant_cotizada) : 0;
          return sum + (tarifaCot * (parseFloat(r.cant_ejecutada as any) || 0));
        }, 0);
        const efecto = actSobrecosto.reduce((sum, r) => sum + (parseFloat(r.efecto_tarifa as any) || 0), 0);
        const pct = base ? Math.round(Math.abs(efecto) / base * 100) : 0;
        imp.contexto = `La hora real costó ${pct}% más que la cotizada, en ${actSobrecosto.length} de ${manoObra.length} actividades`;
      }
    } else if (imp.tipo === 'horas') {
      let maxPct = 0;
      let maxAct = null;
      let horasExtra = 0;
      manoObra.forEach(m => {
        const cCot = parseFloat(m.cant_cotizada as any) || 0;
        const cEjec = parseFloat(m.cant_ejecutada as any) || 0;
        if (cCot > 0 && cEjec > cCot) {
          const pct = ((cEjec - cCot) / cCot) * 100;
          if (pct > maxPct) {
            maxPct = pct;
            maxAct = m.item;
            horasExtra = cEjec - cCot;
          }
        }
      });
      if (maxAct) {
        imp.contexto = `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(horasExtra)} horas sobre las cotizadas · ${shortName(maxAct)} se pasó ${Math.round(maxPct)}%`;
      }
    }
  });

  // Generar preguntas (Bloque C)
  let posiblesPreguntas: { imp: number, texto: string }[] = [];

  // Compras
  const matCompras = materialesProcesados.find(m => m.costo_unit_cotizado && m.costo_unit_ejecutado && m.costo_unit_ejecutado > m.costo_unit_cotizado * 1.05);
  if (matCompras) {
    const pct = Math.round(((matCompras.costo_unit_ejecutado! - matCompras.costo_unit_cotizado!) / matCompras.costo_unit_cotizado!) * 100);
    posiblesPreguntas.push({
      imp: Math.abs(matCompras.efecto_precio || 0),
      texto: `A Compras — ¿por qué ${shortName(matCompras.item)} subió ${pct}% sin recotizar la orden?`
    });
  }

  // Bodega
  const matBodega = materialesProcesados.find(m => (m.efecto_cantidad || 0) < 0);
  if (matBodega) {
    const cCot = parseFloat(matBodega.cant_cotizada as any) || 0;
    const cEjec = parseFloat(matBodega.cant_ejecutada as any) || 0;
    const unidadStr = matBodega.unidad ? ` ${matBodega.unidad}` : '';
    posiblesPreguntas.push({
      imp: Math.abs(matBodega.efecto_cantidad || 0),
      texto: `A Líder de Bodega — ${shortName(matBodega.item)} consumió ${new Intl.NumberFormat('es-CO').format(cEjec - cCot)}${unidadStr} más de lo que correspondía. ¿Merma de proceso o registro?`
    });
  }

  // Costeo
  const actTarifa = manoObra.filter(m => (m.efecto_tarifa || 0) < 0);
  if (actTarifa.length > manoObra.length / 2) {
    const sumTarifa = actTarifa.reduce((sum, r) => sum + Math.abs(r.efecto_tarifa || 0), 0);
    posiblesPreguntas.push({
      imp: sumTarifa,
      texto: `A Costeo y Presupuesto — las tarifas están por encima en ${actTarifa.length} de ${manoObra.length} actividades. ¿Cuándo se actualizaron?`
    });
  }

  // Producción
  const prodMaxAct = manoObra.reduce<{ item: string, pct: number, imp: number } | null>((max, m) => {
    const cCot = parseFloat(m.cant_cotizada as any) || 0;
    const cEjec = parseFloat(m.cant_ejecutada as any) || 0;
    if (cCot > 0 && cEjec > cCot * 1.15) {
      const pct = Math.round(((cEjec - cCot) / cCot) * 100);
      const imp = Math.abs(m.efecto_horas || 0);
      if (!max || imp > max.imp) {
        return { item: m.item, pct, imp };
      }
    }
    return max;
  }, null);
  if (prodMaxAct) {
    posiblesPreguntas.push({
      imp: prodMaxAct.imp,
      texto: `A Líder de Producción — ${shortName(prodMaxAct.item)} se pasó ${prodMaxAct.pct}% de las horas cotizadas. ¿Qué pasó?`
    });
  }

  // Ordenar y seleccionar top 3
  const preguntas = posiblesPreguntas
    .sort((a, b) => b.imp - a.imp)
    .slice(0, 3)
    .map(p => p.texto);


  // Resaltado de mano de obra (mayor Δ% positiva > 50%)
  let maxDif = 50;
  let highlightItem: string | null = null;
  manoObra.forEach(r => {
    const dif = parseFloat(r.diferencia_pct as any);
    if (!isNaN(dif) && dif > maxDif) {
      maxDif = dif;
      highlightItem = r.item;
    }
  });

  // Detección sustitución materiales
  const hasSustitucion = materiales.some(m => parseFloat(m.cant_cotizada as any) === 0 && parseFloat(m.cant_ejecutada as any) > 0) &&
                         materiales.some(m => parseFloat(m.cant_cotizada as any) > 0 && parseFloat(m.cant_ejecutada as any) === 0);

  // Helper de etiquetas
  const renderItemName = (item: string, r: any) => {
    let tag = null;
    const cCotizada = parseFloat(r.cant_cotizada);
    const cEjecutada = parseFloat(r.cant_ejecutada);
    const vEjecutado = parseFloat(r.valor_ejecutado);

    if (cCotizada === 0 && cEjecutada > 0) tag = "no cotizado";
    else if (cEjecutada === 0 && cCotizada > 0) tag = "no ejecutado";
    else if (r.categoria === 'tercero' && vEjecutado === 0) tag = "pendiente de causar";

    return (
      <span>
        {item}
        {tag && <span style={{ fontSize: '11px', color: 'var(--text-warning)', marginLeft: '6px' }}>{tag}</span>}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6" onClick={handleBackdropClick}>
      <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex justify-between items-start p-6 border-b border-slate-100 shrink-0 relative">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2" style={{ letterSpacing: '-0.02em' }}>
              OP {cabecera.nro_op} — {cabecera.cliente}
            </h2>
            <p className="text-sm text-slate-500 mt-1 flex items-center">
              <span>{cabecera.referencia}</span>
              <span className="mx-2 text-slate-300">•</span>
              <span>{fechaFormateada}</span>
              {hasVolumen && (
                <>
                  <span className="mx-2 text-slate-300">|</span>
                  <span>
                    {new Intl.NumberFormat('es-CO').format(opCantCot)} cotizadas → <strong className="text-slate-700">{new Intl.NumberFormat('es-CO').format(opCantEjec)} producidas</strong> 
                    <span className={`ml-1 text-[11px] font-bold ${opCantEjec > opCantCot ? 'text-emerald-600' : opCantEjec < opCantCot ? 'text-amber-600' : 'text-slate-400'}`}>
                      ({opCantEjec > opCantCot ? '+' : ''}{new Intl.NumberFormat('es-CO').format(opCantEjec - opCantCot)}, {opCantEjec > opCantCot ? '+' : ''}{new Intl.NumberFormat('es-CO', {maximumFractionDigits: 1}).format(((opCantEjec - opCantCot) / opCantCot) * 100)}%)
                    </span>
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="text-right mr-16">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Margen</span>
            <span className={`text-2xl font-bold ${cabecera.margen_pct < 0 ? 'text-[var(--text-danger)]' : 'text-slate-800'}`}>
              {cabecera.margen_pct}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide block mt-0.5">meta 29,5%</span>
          </div>
          
          <button 
            onClick={() => setInformeAbierto(true)}
            className="absolute top-4 right-14 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Imprimir a PDF"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          </button>

          <button  
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto" style={{ backgroundColor: 'var(--surface-1)' }}>
          
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-slate-800">Resumen de Impacto</h2>
          </div>

          {/* Bloque A: Resumen Explicativo */}
          <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: totalImpacto < 0 ? 'var(--bg-danger)' : 'var(--bg-success)' }}>
            <p className="text-[14px]" style={{ color: totalImpacto < 0 ? 'var(--text-danger)' : 'var(--text-success)' }}>
              {textoResumen}
            </p>
          </div>

          {/* Bloque B: Barras de impacto */}
          <div className="mb-8 space-y-4">
            {impactosOrdenados.map((item, idx) => {
              if (item.valor === 0) return null;
              const isNegative = item.valor < 0;
              const isTop2 = idx < 2 && isNegative;
              const barColor = isNegative ? (isTop2 ? '#E24B4A' : '#EF9F27') : '#10B981';
              const width = maxImpacto > 0 ? (Math.abs(item.valor) / maxImpacto) * 100 : 0;
              
              return (
                <div key={item.label} className="relative">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: barColor }}>
                      {item.valor > 0 ? '+' : ''}{fmtCOP.format(item.valor)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-1">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${width}%`, backgroundColor: barColor }}
                    />
                  </div>
                  {item.contexto && (
                    <p className="text-[11px] text-slate-500">{item.contexto}</p>
                  )}
                </div>
              );
            })}
            
            {fletesPendientes > 0 && (
              <div className="mt-4 p-3 rounded-lg text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
                ⚠️ <strong>Fletes sin causar:</strong> {fmtCOP.format(fletesPendientes)}. El costo real de esta OP será mayor cuando se registren.
              </div>
            )}
          </div>

          {/* Bloque C: Qué preguntar */}
          {preguntas.length > 0 && (
            <div className="mb-8 pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Qué preguntar en esta OP</h3>
              <ul className="space-y-2">
                {preguntas.map((p, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-probolsas-cyan mt-0.5">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mano de Obra */}
          <div className="mb-8">
            <h3 className="mb-3 font-medium text-[14px]" style={{ color: 'var(--text-main)' }}>Mano de obra</h3>
            <div className="bg-white rounded-[12px] shadow-sm overflow-hidden" style={{ border: '0.5px solid var(--border)', padding: '0.75rem 1rem' }}>
              <table className="w-full text-left" style={{ tableLayout: 'fixed', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '0.5px solid var(--border-strong)' }}>
                    <th className="py-2 w-1/3">Actividad</th>
                    <th className="py-2 text-right">Cot h</th>
                    <th className="py-2 text-right">Ejec h</th>
                    <th className="py-2 text-center">Δ</th>
                    <th className="py-2 text-right">Ef. horas</th>
                    <th className="py-2 text-right">Ef. tarifa</th>
                  </tr>
                </thead>
                <tbody>
                  {manoObra.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-slate-400">Sin registros</td></tr>
                  )}
                  {manoObra.map((r, i) => {
                    const isHighlight = r.item === highlightItem;
                    const rowStyle = isHighlight ? { backgroundColor: 'var(--bg-danger)', fontWeight: 500 } : { borderBottom: i === manoObra.length -1 ? 'none' : '0.5px solid var(--border)' };
                    const cellColor = (val: number | null) => {
                      if (isHighlight) return 'var(--text-danger)'; // usa el color del texto danger para unificar visualmente en el Highlight
                      if (val == null || val === 0) return 'var(--text-main)';
                      return val < 0 ? 'var(--text-danger)' : 'var(--text-success)';
                    };
                    
                    return (
                      <tr key={r.item} style={rowStyle}>
                        <td className="py-2" style={{ color: isHighlight ? 'var(--text-danger)' : 'inherit' }}>{renderItemName(r.item, r)}</td>
                        <td className="py-2 text-right" style={{ color: isHighlight ? 'var(--text-danger)' : 'var(--text-secondary)' }}>{formatNumber(r.cant_cotizada)}</td>
                        <td className="py-2 text-right" style={{ fontWeight: r.cant_ejecutada > 0 ? 600 : 400, color: isHighlight ? 'var(--text-danger)' : 'inherit' }}>{formatNumber(r.cant_ejecutada)}</td>
                        <td className="py-2 text-center" style={{ color: isHighlight ? 'var(--text-danger)' : cellColor(r.diferencia_pct ? r.diferencia_pct * -1 : null) }}>
                          {formatPct(r.diferencia_pct)}
                        </td>
                        <td className="py-2 text-right" style={{ color: cellColor(r.efecto_horas) }}>{formatMoney(r.efecto_horas)}</td>
                        <td className="py-2 text-right" style={{ color: cellColor(r.efecto_tarifa) }}>{formatMoney(r.efecto_tarifa)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Materiales */}
          <div className="mb-8">
            <h3 className="mb-3 font-medium text-[14px]" style={{ color: 'var(--text-main)' }}>Materiales</h3>
            <div className="bg-white rounded-[12px] shadow-sm overflow-hidden" style={{ border: '0.5px solid var(--border)', padding: '0.75rem 1rem' }}>
              
              {hasSustitucion && (
                <div className="mb-3 px-3 py-2 rounded flex items-center gap-2" style={{ backgroundColor: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: '13px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8"></polyline>
                    <line x1="4" y1="20" x2="21" y2="3"></line>
                    <polyline points="21 16 21 21 16 21"></polyline>
                    <line x1="15" y1="15" x2="21" y2="21"></line>
                    <line x1="4" y1="4" x2="9" y2="9"></line>
                  </svg>
                  Sustitución de material — se cotizó un material y se consumió otro
                </div>
              )}

              <table className="w-full text-left" style={{ tableLayout: 'fixed', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '0.5px solid var(--border-strong)' }}>
                    <th className="py-2 w-1/3">Material</th>
                    <th className="py-2 text-right">Cot</th>
                    <th className="py-2 text-right">Ejec</th>
                    <th className="py-2 text-right">Costo u. cot</th>
                    <th className="py-2 text-right">Costo u. ejec</th>
                    <th className="py-2 text-right">Cumplimiento bruto</th>
                  </tr>
                </thead>
                <tbody>
                  {materialesProcesados.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-slate-400">Sin registros</td></tr>
                  )}
                  {materialesProcesados.map((r, i) => {
                    const rowStyle = { borderBottom: i === materialesProcesados.length -1 ? 'none' : '0.5px solid var(--border)' };
                    const cellColor = (val: number | null) => {
                      if (val == null || val === 0) return 'var(--text-main)';
                      return val < 0 ? 'var(--text-danger)' : 'var(--text-success)';
                    };
                    return (
                      <tr key={r.item} style={rowStyle}>
                        <td className="py-2">{renderItemName(r.item, r)}</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>
                          {formatNumber(r.cant_cotizada)}{r.unidad ? ` ${r.unidad}` : ''}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatNumber(r.cant_ejecutada)}{r.unidad ? ` ${r.unidad}` : ''}
                        </td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatMoney(r.costo_unit_cotizado)}</td>
                        <td className="py-2 text-right font-medium">{formatMoney(r.costo_unit_ejecutado)}</td>
                        <td className="py-2 text-right font-medium" style={{ color: cellColor(r.cumplimiento) }}>{formatMoney(r.cumplimiento)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Terceros */}
          <div>
            <h3 className="mb-3 font-medium text-[14px]" style={{ color: 'var(--text-main)' }}>Terceros</h3>
            <div className="bg-white rounded-[12px] shadow-sm overflow-hidden" style={{ border: '0.5px solid var(--border)', padding: '0.75rem 1rem' }}>
              <table className="w-full text-left" style={{ tableLayout: 'fixed', fontSize: '12.5px' }}>
                <thead>
                  <tr className="sr-only">
                    <th>Item</th>
                    <th>Cotizado</th>
                    <th>Ejecutado</th>
                  </tr>
                </thead>
                <tbody>
                  {terceros.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center text-slate-400">Sin registros</td></tr>
                  )}
                  {terceros.map((r, i) => {
                    const rowStyle = { borderBottom: i === terceros.length -1 ? 'none' : '0.5px solid var(--border)' };
                    return (
                      <tr key={r.item} style={rowStyle}>
                        <td className="py-2 w-1/2">{renderItemName(r.item, r)}</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatMoney(r.valor_cotizado)}</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-muted)' }}>{formatMoney(r.valor_ejecutado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {informeAbierto && (
        <InformePDFModal
          tipoInforme="OP"
          requestData={{
            responsable: `OP ${cabecera.nro_op}`,
            tipo_efecto: 'Trazabilidad',
            periodo_inicio: cabecera.fecha.split('T')[0],
            periodo_fin: cabecera.fecha.split('T')[0]
          }}
          titulo={`Trazabilidad OP ${cabecera.nro_op}`}
          entidadLabel="Cliente:"
          entidadValue={cabecera.cliente}
          firmaLabel="Firma Autorizada"
          firmaDerechaLabel="Firma responsable"
          numeroInformeFijo={cabecera.nro_op}
          onClose={() => setInformeAbierto(false)}
          infoExtra={
            <>
              <p><span className="font-semibold w-24 inline-block">Referencia:</span> {cabecera.referencia}</p>
              {hasVolumen && (
                <p><span className="font-semibold w-24 inline-block">Producción:</span> {new Intl.NumberFormat('es-CO').format(opCantCot)} cotizadas → {new Intl.NumberFormat('es-CO').format(opCantEjec)} producidas</p>
              )}
              <p><span className="font-semibold w-24 inline-block">Margen:</span> <span className={cabecera.margen_pct < 0 ? 'text-red-600 font-bold' : ''}>{cabecera.margen_pct}% (meta 29,5%)</span></p>
            </>
          }
        >
          {/* Bloque A: Resumen Explicativo en PDF */}
          <div className="mb-6 p-4 rounded-xl print:border print:border-slate-200" style={{ backgroundColor: totalImpacto < 0 ? 'var(--bg-danger)' : 'var(--bg-success)' }}>
            <p className="text-[14px] font-medium" style={{ color: totalImpacto < 0 ? 'var(--text-danger)' : 'var(--text-success)' }}>
              {textoResumen}
            </p>
          </div>

          {/* Bloque B: Barras de impacto en PDF */}
          <div className="mb-8 space-y-4 print:break-inside-avoid">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider border-b border-slate-200 pb-2">Desglose de Impacto</h3>
            {impactosOrdenados.map((item, idx) => {
              if (item.valor === 0) return null;
              const isNegative = item.valor < 0;
              const isTop2 = idx < 2 && isNegative;
              const barColor = isNegative ? (isTop2 ? '#E24B4A' : '#EF9F27') : '#10B981';
              const width = maxImpacto > 0 ? (Math.abs(item.valor) / maxImpacto) * 100 : 0;
              
              return (
                <div key={item.label} className="relative">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: barColor }}>
                      {item.valor > 0 ? '+' : ''}{fmtCOP.format(item.valor)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-1 print:border print:border-slate-200">
                    <div 
                      className="h-full rounded-full print:bg-slate-800" 
                      style={{ width: `${width}%`, backgroundColor: barColor }}
                    />
                  </div>
                  {item.contexto && (
                    <p className="text-[11px] text-slate-500">{item.contexto}</p>
                  )}
                </div>
              );
            })}
            
            {fletesPendientes > 0 && (
              <div className="mt-4 p-3 rounded-lg text-sm bg-yellow-50 text-yellow-800 border border-yellow-200 print:bg-transparent print:border-slate-300 print:text-slate-700">
                ⚠️ <strong>Fletes sin causar:</strong> {fmtCOP.format(fletesPendientes)}. El costo real de esta OP será mayor cuando se registren.
              </div>
            )}
          </div>

          {/* Bloque C: Qué preguntar en PDF */}
          {preguntas.length > 0 && (
            <div className="mb-8 pt-6 border-t border-slate-200 print:break-inside-avoid">
              <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Puntos de atención detectados</h3>
              <ul className="space-y-2">
                {preguntas.map((p, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-probolsas-cyan print:text-slate-800 mt-0.5">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm text-slate-600 mb-6 bg-slate-100 p-3 rounded-lg print:bg-transparent print:p-0 print:border-b print:border-slate-200 print:rounded-none">
            Contexto: Detalle de ejecución de costos de la orden de producción comparado con la cotización.
          </div>

          <div className="mb-8">
            <h3 className="mb-2 font-bold text-lg text-slate-800 border-b border-slate-300 pb-1">Mano de obra</h3>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                  <th className="py-2">Actividad</th>
                  <th className="py-2 text-right">Cot. (h)</th>
                  <th className="py-2 text-right">Ejec. (h)</th>
                  <th className="py-2 text-center">Δ</th>
                  <th className="py-2 text-right">Ef. horas</th>
                  <th className="py-2 text-right">Ef. tarifa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {manoObra.map((r, i) => (
                  <tr key={i} className="print:break-inside-avoid">
                    <td className="py-1">{r.item}</td>
                    <td className="py-1 text-right text-slate-500">{formatNumber(r.cant_cotizada)}</td>
                    <td className="py-1 text-right">{formatNumber(r.cant_ejecutada)}</td>
                    <td className="py-1 text-center font-medium">{formatPct(r.diferencia_pct)}</td>
                    <td className={`py-1 text-right font-medium ${r.efecto_horas !== null && r.efecto_horas < 0 ? 'text-red-600' : ''}`}>{formatMoney(r.efecto_horas)}</td>
                    <td className={`py-1 text-right font-medium ${r.efecto_tarifa !== null && r.efecto_tarifa < 0 ? 'text-red-600' : ''}`}>{formatMoney(r.efecto_tarifa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-8">
            <h3 className="mb-2 font-bold text-lg text-slate-800 border-b border-slate-300 pb-1">Materiales</h3>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                  <th className="py-2">Material</th>
                  <th className="py-2 text-right">Cant. Cot</th>
                  <th className="py-2 text-right">Cant. Ejec</th>
                  <th className="py-2 text-right">Costo u. cot</th>
                  <th className="py-2 text-right">Costo u. ejec</th>
                  <th className="py-2 text-right">Cumplimiento bruto ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materialesProcesados.map((r, i) => (
                  <tr key={i} className="print:break-inside-avoid">
                    <td className="py-1">{r.item}</td>
                    <td className="py-1 text-right text-slate-500">{formatNumber(r.cant_cotizada)}</td>
                    <td className="py-1 text-right">{formatNumber(r.cant_ejecutada)}</td>
                    <td className="py-1 text-right text-slate-500">{formatMoney(r.costo_unit_cotizado)}</td>
                    <td className="py-1 text-right">{formatMoney(r.costo_unit_ejecutado)}</td>
                    <td className={`py-1 text-right font-medium ${r.cumplimiento !== null && r.cumplimiento < 0 ? 'text-red-600' : ''}`}>{formatMoney(r.cumplimiento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-8">
            <h3 className="mb-2 font-bold text-lg text-slate-800 border-b border-slate-300 pb-1">Terceros</h3>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                  <th className="py-2">Servicio</th>
                  <th className="py-2 text-right">Cotizado ($)</th>
                  <th className="py-2 text-right">Ejecutado ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {terceros.map((r, i) => (
                  <tr key={i} className="print:break-inside-avoid">
                    <td className="py-1">{r.item}</td>
                    <td className="py-1 text-right text-slate-500">{formatMoney(r.valor_cotizado)}</td>
                    <td className="py-1 text-right">{formatMoney(r.valor_ejecutado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </InformePDFModal>
      )}

    </div>
  );
}
