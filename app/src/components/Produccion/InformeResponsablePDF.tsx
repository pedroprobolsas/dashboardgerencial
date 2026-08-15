import { useState } from 'react';
import type { LineaResponsable } from '../../services/api';
import InformePDFModal from './InformePDFModal';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

interface Props {
  detalle: LineaResponsable[];
  fechaInicio: string;
  fechaFin: string;
  onClose: () => void;
}

export default function InformeResponsablePDF({ detalle, fechaInicio, fechaFin, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [responsable, setResponsable] = useState('');
  const [tipoEfecto, setTipoEfecto] = useState<'horas' | 'tarifa' | 'ambos'>('ambos');
  const [error, setError] = useState<string | null>(null);

  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-lg text-slate-800">Generar Informe PDF</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="p-6 flex flex-col gap-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre del Responsable</label>
              <input 
                type="text" 
                value={responsable} 
                onChange={e => setResponsable(e.target.value)}
                placeholder="Ej. Jesús, Cristian, Área Planta..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
                autoFocus
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Efecto a incluir</label>
              <select 
                value={tipoEfecto} 
                onChange={e => setTipoEfecto(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
              >
                <option value="horas">Solo Efecto Horas (Planta)</option>
                <option value="tarifa">Solo Efecto Tarifa (Costos)</option>
                <option value="ambos">Ambos (Cumplimiento Oficial)</option>
              </select>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-600">
              <p>El informe cubrirá el período del <strong className="text-slate-800">{fechaInicio}</strong> al <strong className="text-slate-800">{fechaFin}</strong>, procesando <strong>{detalle.length}</strong> actividades.</p>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button 
              onClick={() => {
                if (!responsable.trim()) {
                  setError('Por favor ingrese el nombre del responsable.');
                  return;
                }
                setStep(2);
              }}
              className="px-5 py-2 text-sm font-bold text-white bg-probolsas-cyan hover:bg-cyan-600 rounded-lg transition-colors shadow-sm"
            >
              Continuar a Vista de Impresión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Filtrado y separación de actividades
  const actividades = detalle.map(d => {
    const efHoras = parseFloat(d.efecto_horas as any) || 0;
    const efTarifa = parseFloat(d.efecto_tarifa as any) || 0;
    let impacto = 0;
    
    if (tipoEfecto === 'horas') impacto = efHoras;
    else if (tipoEfecto === 'tarifa') impacto = efTarifa;
    else impacto = efHoras + efTarifa; // ambos
    
    return { ...d, impacto };
  });

  const sobrecostos = actividades.filter(a => a.impacto < 0).sort((a, b) => a.impacto - b.impacto); // menor (mas negativo) a mayor
  const ahorros = actividades.filter(a => a.impacto > 0).sort((a, b) => b.impacto - a.impacto); // mayor (mas positivo) a menor

  const totalSobrecosto = sobrecostos.reduce((acc, curr) => acc + curr.impacto, 0);
  const totalAhorro = ahorros.reduce((acc, curr) => acc + curr.impacto, 0);

  const horasSobrecosto = sobrecostos.reduce((acc, curr) => acc + (parseFloat(curr.cant_ejecutada as any) || 0) - (parseFloat(curr.cant_cotizada as any) || 0), 0);
  const horasAhorro = ahorros.reduce((acc, curr) => acc + (parseFloat(curr.cant_ejecutada as any) || 0) - (parseFloat(curr.cant_cotizada as any) || 0), 0);
  
  const baseSobrecosto = sobrecostos.reduce((acc, curr) => acc + (parseFloat(curr.tarifa_cotizada as any) || 0) * (parseFloat(curr.cant_ejecutada as any) || 0), 0);
  const baseAhorro = ahorros.reduce((acc, curr) => acc + (parseFloat(curr.tarifa_cotizada as any) || 0) * (parseFloat(curr.cant_ejecutada as any) || 0), 0);
  
  const uniqueOps = new Set(actividades.map(a => a.nro_op)).size;

  const infoExtra = (
    <>
      <p><span className="font-semibold w-24 inline-block">Período:</span> {fechaInicio} a {fechaFin}</p>
      <p><span className="font-semibold w-24 inline-block">Métrica:</span> {tipoEfecto === 'horas' ? 'Efecto Horas' : tipoEfecto === 'tarifa' ? 'Efecto Tarifa' : 'Cumplimiento Oficial (Horas + Tarifa)'}</p>
    </>
  );

  return (
    <InformePDFModal
      tipoInforme="Responsables"
      requestData={{
        responsable, 
        tipo_efecto: tipoEfecto,
        periodo_inicio: fechaInicio,
        periodo_fin: fechaFin
      }}
      titulo="Informe de Desempeño"
      entidadLabel="Responsable:"
      entidadValue={responsable}
      infoExtra={infoExtra}
      onClose={onClose}
    >
      {/* Global Cards */}
      <div className="grid grid-cols-2 gap-6 mb-8 mt-6">
        <div className="border-2 border-red-100 rounded-xl p-6 bg-red-50/50 print:bg-transparent print:border-red-600">
          <span className="text-sm font-bold text-red-600 uppercase tracking-wider block mb-2">Total Sobrecosto</span>
          <span className="text-4xl font-black text-red-600 tracking-tight">{fmtCOP.format(totalSobrecosto)}</span>
          <span className="text-sm font-medium text-slate-600 block mt-2">En {sobrecostos.length} de {actividades.length} actividades</span>
          {tipoEfecto === 'horas' && (
            <span className="text-xs text-slate-500 mt-1 block">+{fmtNum.format(horasSobrecosto)} horas de más</span>
          )}
          {tipoEfecto === 'tarifa' && (
            <span className="text-xs text-slate-500 mt-1 block">tarifa real +{baseSobrecosto ? fmtNum.format(-totalSobrecosto / baseSobrecosto * 100) : 0}% sobre la cotizada</span>
          )}
        </div>
        <div className="border-2 border-emerald-100 rounded-xl p-6 bg-emerald-50/50 print:bg-transparent print:border-emerald-600">
          <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider block mb-2">Total Ahorro</span>
          <span className="text-4xl font-black text-emerald-600 tracking-tight">+{fmtCOP.format(totalAhorro)}</span>
          <span className="text-sm font-medium text-slate-600 block mt-2">En {ahorros.length} de {actividades.length} actividades</span>
          {tipoEfecto === 'horas' && (
            <span className="text-xs text-slate-500 mt-1 block">{fmtNum.format(horasAhorro)} horas</span>
          )}
          {tipoEfecto === 'tarifa' && (
            <span className="text-xs text-slate-500 mt-1 block">tarifa real {baseAhorro ? fmtNum.format(-totalAhorro / baseAhorro * 100) : 0}% sobre la cotizada</span>
          )}
        </div>
      </div>

      <div className="text-sm text-slate-600 mb-6 bg-slate-100 p-3 rounded-lg print:bg-transparent print:p-0 print:border-b print:border-slate-200 print:rounded-none">
        Contexto: Se analizaron un total de <strong>{actividades.length}</strong> actividades productivas correspondientes a <strong>{uniqueOps}</strong> Órdenes de Producción (OP).
      </div>

      {/* Table - Sobrecostos */}
      {sobrecostos.length > 0 && (
        <div className="mb-10">
          <h3 className="text-lg font-bold text-red-700 border-b border-red-200 pb-2 mb-4">Actividades con Sobrecosto</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Actividad</th>
                <th className="py-2 text-right">H. Cot</th>
                <th className="py-2 text-right">H. Ejec</th>
                <th className="py-2 text-right">Impacto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sobrecostos.map((a, i) => (
                <tr key={i} className="print:break-inside-avoid">
                  <td className="py-2 font-semibold">{a.nro_op}</td>
                  <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.actividad}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum.format(a.cant_cotizada)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtNum.format(a.cant_ejecutada)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-red-600">{fmtCOP.format(a.impacto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table - Ahorros */}
      {ahorros.length > 0 && (
        <div className="mb-12 print:break-before-auto">
          <h3 className="text-lg font-bold text-emerald-700 border-b border-emerald-200 pb-2 mb-4">Actividades con Ahorro</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Actividad</th>
                <th className="py-2 text-right">H. Cot</th>
                <th className="py-2 text-right">H. Ejec</th>
                <th className="py-2 text-right">Impacto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ahorros.map((a, i) => (
                <tr key={i} className="print:break-inside-avoid">
                  <td className="py-2 font-semibold">{a.nro_op}</td>
                  <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.actividad}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum.format(a.cant_cotizada)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtNum.format(a.cant_ejecutada)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-emerald-600">+{fmtCOP.format(a.impacto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </InformePDFModal>
  );
}
