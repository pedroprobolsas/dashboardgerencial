import { useState } from 'react';
import type { LineaResponsable } from '../../services/api';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

interface Props {
  detalle: LineaResponsable[];
  fechaInicio: string;
  fechaFin: string;
  onClose: () => void;
}

export default function InformeResponsableModal({ detalle, fechaInicio, fechaFin, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [responsable, setResponsable] = useState('');
  const [tipoEfecto, setTipoEfecto] = useState<'horas' | 'tarifa' | 'ambos'>('ambos');
  
  // Informe data
  const [consecutivo, setConsecutivo] = useState<string>('');
  const [fechaInforme, setFechaInforme] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!responsable.trim()) {
      setError('Por favor ingrese el nombre del responsable.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/informes/consecutivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsable, tipo_efecto: tipoEfecto })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al generar consecutivo');
      
      setConsecutivo(String(data.consecutivo));
      // Pre-cargar fecha en formato local yyyy-mm-dd
      setFechaInforme(new Date(data.fecha).toISOString().split('T')[0]);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

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
  
  const uniqueOps = new Set(actividades.map(a => a.nro_op)).size;

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
              <p>El informe cubrirá el período del <strong className="text-slate-800">{fechaInicio}</strong> al <strong className="text-slate-800">{fechaFin}</strong>, procesando <strong>{actividades.length}</strong> actividades.</p>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button 
              onClick={handleGenerate} 
              disabled={loading}
              className="px-5 py-2 text-sm font-bold text-white bg-probolsas-cyan hover:bg-cyan-600 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full"></div>
              ) : 'Crear Informe'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: The actual report view
  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto print-modal">
      
      {/* Top Action Bar (Hidden when printing) */}
      <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-10 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="font-semibold text-slate-700">Vista de Impresión</span>
        </div>
        <button 
          onClick={() => {
            document.title = \`Informe \${consecutivo} - \${fechaInforme} - \${responsable}\`;
            window.print();
          }} 
          className="px-5 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors shadow-sm flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Imprimir a PDF
        </button>
      </div>

      {/* A4 / Letter Canvas */}
      <div className="max-w-4xl mx-auto my-8 bg-white p-12 shadow-sm border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-0 print:max-w-none">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">Informe de Desempeño</h1>
            <div className="text-sm text-slate-600 flex flex-col gap-1">
              <p><span className="font-semibold w-24 inline-block">Responsable:</span> {responsable}</p>
              <p><span className="font-semibold w-24 inline-block">Período:</span> {fechaInicio} a {fechaFin}</p>
              <p><span className="font-semibold w-24 inline-block">Métrica:</span> {tipoEfecto === 'horas' ? 'Efecto Horas' : tipoEfecto === 'tarifa' ? 'Efecto Tarifa' : 'Cumplimiento Oficial (Horas + Tarifa)'}</p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="text-xl font-bold text-slate-800 tracking-tight">Informe N° {consecutivo}</span>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
              <span>Fecha:</span>
              <input 
                type="date" 
                value={fechaInforme} 
                onChange={e => setFechaInforme(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded text-slate-700 focus:outline-none focus:border-probolsas-cyan print:border-none print:p-0 print:w-auto"
              />
            </div>
          </div>
        </div>

        {/* Global Cards */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="border-2 border-red-100 rounded-xl p-6 bg-red-50/50 print:bg-transparent print:border-red-600">
            <span className="text-sm font-bold text-red-600 uppercase tracking-wider block mb-2">Total Sobrecosto</span>
            <span className="text-4xl font-black text-red-600 tracking-tight">{fmtCOP.format(totalSobrecosto)}</span>
            <span className="text-sm font-medium text-slate-600 block mt-2">En {sobrecostos.length} de {actividades.length} actividades</span>
          </div>
          <div className="border-2 border-emerald-100 rounded-xl p-6 bg-emerald-50/50 print:bg-transparent print:border-emerald-600">
            <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider block mb-2">Total Ahorro</span>
            <span className="text-4xl font-black text-emerald-600 tracking-tight">+{fmtCOP.format(totalAhorro)}</span>
            <span className="text-sm font-medium text-slate-600 block mt-2">En {ahorros.length} de {actividades.length} actividades</span>
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

        {/* Observaciones */}
        <div className="mb-10 print:break-inside-avoid">
          <h3 className="text-lg font-bold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">Análisis y Observaciones</h3>
          <textarea 
            className="w-full h-32 p-4 border border-slate-200 rounded-lg text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 print:border-none print:p-0 print:h-auto print:resize-none"
            placeholder="Escribe el análisis detallado aquí. Si dejas esto vacío, se imprimirá un espacio en blanco para escribir a mano..."
          ></textarea>
          {/* Espacio extra oculto en pantalla para llenar a mano en el PDF si el textarea está vacío */}
          <div className="hidden print:block h-32 border-b border-dashed border-slate-300"></div>
          <div className="hidden print:block h-12 border-b border-dashed border-slate-300"></div>
        </div>

        {/* Compromisos */}
        <div className="mb-16 print:break-inside-avoid">
          <h3 className="text-lg font-bold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">Compromisos</h3>
          <table className="w-full text-left border-collapse text-sm mb-4">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                <th className="py-2 w-3/5">Acción</th>
                <th className="py-2 w-1/5">Responsable</th>
                <th className="py-2 w-1/5">Fecha Límite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[1, 2, 3].map(i => (
                <tr key={i}>
                  <td className="py-3 pr-4"><input type="text" className="w-full bg-slate-50 px-2 py-1 rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-300 print:bg-transparent print:p-0" placeholder="Descripción de la acción..." /></td>
                  <td className="py-3 pr-4"><input type="text" className="w-full bg-slate-50 px-2 py-1 rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-300 print:bg-transparent print:p-0" placeholder="Nombre" /></td>
                  <td className="py-3"><input type="text" className="w-full bg-slate-50 px-2 py-1 rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-300 print:bg-transparent print:p-0" placeholder="DD/MM/AAAA" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Firmas */}
        <div className="flex justify-between items-end pt-16 print:break-inside-avoid">
          <div className="w-64 text-center">
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">Gerencia / Jefatura</div>
          </div>
          <div className="w-64 text-center">
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">{responsable}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
