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
  const sumaMateriales = materiales.reduce((sum, r) => sum + (parseFloat(r.cumplimiento as any) || 0), 0);
  const fletesPendientes = terceros.reduce((sum, r) => sum + (r.valor_ejecutado === 0 ? (parseFloat(r.valor_cotizado as any) || 0) : 0), 0);

  // Formatear fecha
  const fechaFormateada = new Date(cabecera.fecha).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).replace('.', ''); // remover punto de 'ago.' si existe

  // Lógica de tarjetas
  const getCardStyle = (val: number, isFlete: boolean = false) => {
    if (isFlete) {
      if (val > 0) return { bg: 'var(--bg-warning)', text: 'var(--text-warning)' };
      return { bg: 'var(--surface-1)', text: 'var(--text-secondary)' };
    }
    if (val < 0) return { bg: 'var(--bg-danger)', text: 'var(--text-danger)' }; // Sobrecosto
    if (val > 0) return { bg: 'var(--bg-success)', text: 'var(--text-success)' }; // Ahorro
    return { bg: 'var(--surface-1)', text: 'var(--text-secondary)' }; // Neutro
  };

  const renderCard = (label: string, value: number, isFlete: boolean = false) => {
    const style = getCardStyle(value, isFlete);
    return (
      <div 
        className="flex flex-col justify-center"
        style={{ 
          backgroundColor: style.bg,
          color: style.text,
          borderRadius: 'var(--radius)', 
          padding: '0.85rem' 
        }}
      >
        <span style={{ fontSize: '12px', marginBottom: '4px' }}>{label}</span>
        <span style={{ fontSize: '20px', fontWeight: 500 }}>{formatMoney(value)}</span>
      </div>
    );
  };

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
            <p className="text-sm text-slate-500 mt-1">
              {cabecera.referencia} · {fechaFormateada}
            </p>
          </div>
          <div className="text-right mr-16">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Margen</span>
            <span className={`text-2xl font-bold ${cabecera.margen_pct < 0 ? 'text-[var(--text-danger)]' : 'text-slate-800'}`}>
              {cabecera.margen_pct}%
            </span>
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
          
          {/* Tarjetas de Resumen */}
          <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {renderCard("Efecto horas — Jesús", sumaHoras)}
            {renderCard("Efecto tarifa — Cristian", sumaTarifa)}
            {renderCard("Materiales — Franklin", sumaMateriales)}
            {renderCard("Fletes sin causar", fletesPendientes, true)}
          </div>

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
                    <th className="py-2 w-1/2">Material</th>
                    <th className="py-2 text-right">Cot</th>
                    <th className="py-2 text-right">Ejec</th>
                    <th className="py-2 text-right">Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {materiales.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sin registros</td></tr>
                  )}
                  {materiales.map((r, i) => {
                    const rowStyle = { borderBottom: i === materiales.length -1 ? 'none' : '0.5px solid var(--border)' };
                    const cellColor = (val: number | null) => {
                      if (val == null || val === 0) return 'var(--text-main)';
                      return val < 0 ? 'var(--text-danger)' : 'var(--text-success)';
                    };
                    return (
                      <tr key={r.item} style={rowStyle}>
                        <td className="py-2">{renderItemName(r.item, r)}</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatNumber(r.cant_cotizada)}</td>
                        <td className="py-2 text-right font-medium">{formatNumber(r.cant_ejecutada)}</td>
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
              <p><span className="font-semibold w-24 inline-block">Margen:</span> <span className={cabecera.margen_pct < 0 ? 'text-red-600 font-bold' : ''}>{cabecera.margen_pct}%</span></p>
            </>
          }
        >
          {/* Tarjetas de Resumen */}
          <div className="grid grid-cols-4 gap-4 mb-8 mt-6">
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <span className="text-xs font-bold text-slate-600 uppercase block mb-1">Efecto horas (Jesús)</span>
              <span className={`text-xl font-black ${sumaHoras < 0 ? 'text-red-600' : sumaHoras > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{formatMoney(sumaHoras)}</span>
            </div>
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <span className="text-xs font-bold text-slate-600 uppercase block mb-1">Efecto tarifa (Cris)</span>
              <span className={`text-xl font-black ${sumaTarifa < 0 ? 'text-red-600' : sumaTarifa > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{formatMoney(sumaTarifa)}</span>
            </div>
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <span className="text-xs font-bold text-slate-600 uppercase block mb-1">Materiales (Bodega)</span>
              <span className={`text-xl font-black ${sumaMateriales < 0 ? 'text-red-600' : sumaMateriales > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{formatMoney(sumaMateriales)}</span>
            </div>
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <span className="text-xs font-bold text-slate-600 uppercase block mb-1">Fletes sin causar</span>
              <span className="text-xl font-black text-amber-600">{formatMoney(fletesPendientes)}</span>
            </div>
          </div>

          <div className="text-sm text-slate-600 mb-6 bg-slate-100 p-3 rounded-lg print:bg-transparent print:p-0 print:border-b print:border-slate-200 print:rounded-none">
            Contexto: Detalle de ejecución de costos de la orden de producción.
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
                  <th className="py-2 text-right">Cumplimiento ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materiales.map((r, i) => (
                  <tr key={i} className="print:break-inside-avoid">
                    <td className="py-1">{r.item}</td>
                    <td className="py-1 text-right text-slate-500">{formatNumber(r.cant_cotizada)}</td>
                    <td className="py-1 text-right">{formatNumber(r.cant_ejecutada)}</td>
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
