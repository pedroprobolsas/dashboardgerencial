import { useState, type ReactNode } from 'react';

interface Props {
  tipoInforme: string;
  requestData: any;
  titulo: string;
  entidadLabel: string;
  entidadValue: string;
  infoExtra?: ReactNode; // Por ejemplo, Periodo, Métrica...
  firmaLabel?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function InformePDFModal({ 
  tipoInforme, 
  requestData, 
  titulo, 
  entidadLabel, 
  entidadValue, 
  infoExtra, 
  firmaLabel = 'Gerencia / Jefatura',
  onClose, 
  children 
}: Props) {
  
  const [consecutivo, setConsecutivo] = useState<string>('[Borrador]');
  const [fechaInforme, setFechaInforme] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    // Si ya tiene número, solo imprimir
    if (consecutivo !== '[Borrador]') {
      document.title = `Informe ${consecutivo} - ${entidadValue}`;
      window.print();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/informes/consecutivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestData, tipo_informe: tipoInforme })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al generar consecutivo');
      
      const num = String(data.consecutivo || data.numero || '');
      setConsecutivo(num);
      
      if (data.fecha) {
        setFechaInforme(new Date(data.fecha).toISOString().split('T')[0]);
      }

      // Dar tiempo a React para renderizar el número antes de abrir el diálogo de impresión
      setTimeout(() => {
        document.title = `Informe ${num} - ${entidadValue}`;
        window.print();
        setLoading(false);
      }, 200);

    } catch (err: any) {
      alert(err.message || 'Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto print-modal">
      
      {/* Top Action Bar (Hidden when printing) */}
      <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-10 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="font-semibold text-slate-700">Vista de Impresión - {titulo}</span>
        </div>
        <button 
          onClick={handlePrint} 
          disabled={loading}
          className="px-5 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full"></div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          )}
          {consecutivo !== '[Borrador]' ? 'Re-imprimir' : 'Generar PDF'}
        </button>
      </div>

      {/* A4 / Letter Canvas */}
      <div className="max-w-4xl mx-auto my-8 bg-white p-12 shadow-sm border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-0 print:max-w-none">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">{titulo}</h1>
            <div className="text-sm text-slate-600 flex flex-col gap-1">
              <p><span className="font-semibold w-24 inline-block">{entidadLabel}</span> {entidadValue}</p>
              {infoExtra}
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

        {/* Content injected here (Cards and Tables) */}
        {children}

        {/* Observaciones */}
        <div className="mb-10 print:break-inside-avoid mt-8">
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
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">{firmaLabel}</div>
          </div>
          <div className="w-64 text-center">
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">{entidadValue}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
