import type { OrdenProduccion, CostoPorOrdenResumen } from '../../services/api';
import InformePDFModal from './InformePDFModal';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

interface Props {
  ordenes: OrdenProduccion[];
  resumen: CostoPorOrdenResumen;
  fechaInicio: string;
  fechaFin: string;
  margenMinimo: number;
  onClose: () => void;
}

export default function InformeMargenPDF({ ordenes, resumen, fechaInicio, fechaFin, margenMinimo, onClose }: Props) {
  
  const infoExtra = (
    <>
      <p><span className="font-semibold w-32 inline-block">Período:</span> {fechaInicio} a {fechaFin}</p>
      <p><span className="font-semibold w-32 inline-block">Umbral Crítico:</span> {margenMinimo}%</p>
    </>
  );

  return (
    <InformePDFModal
      tipoInforme="MargenOP"
      requestData={{
        responsable: 'Gerencia', 
        periodo_inicio: fechaInicio,
        periodo_fin: fechaFin
      }}
      titulo="Informe: Margen por OP"
      entidadLabel="Alcance:"
      entidadValue="Análisis de Rentabilidad"
      infoExtra={infoExtra}
      firmaLabel="Gerencia General"
      firmaDerechaLabel="Finanzas / Producción"
      onClose={onClose}
    >
      {/* Global Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8 mt-6">
        <div className="border-2 border-slate-100 rounded-xl p-4 bg-slate-50 print:bg-transparent print:border-slate-300">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Total OPs Período</span>
          <span className="text-2xl font-black text-slate-800">{resumen.total_ops}</span>
        </div>
        <div className="border-2 border-slate-100 rounded-xl p-4 bg-slate-50 print:bg-transparent print:border-slate-300">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Margen Promedio</span>
          <span className={`text-2xl font-black ${resumen.margen_promedio < margenMinimo ? 'text-red-600' : 'text-slate-800'}`}>
            {resumen.margen_promedio}%
          </span>
        </div>
        <div className="border-2 border-red-100 rounded-xl p-4 bg-red-50 print:bg-transparent print:border-red-500">
          <span className="text-xs font-bold text-red-600 uppercase tracking-wider block mb-1">Bajo Umbral</span>
          <span className="text-2xl font-black text-red-600">{resumen.ops_bajo_umbral}</span>
        </div>
        <div className="border-2 border-slate-100 rounded-xl p-4 bg-slate-50 print:bg-transparent print:border-slate-300">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Valor Facturado</span>
          <span className="text-2xl font-black text-slate-800">{fmtCOP.format(resumen.valor_facturado)}</span>
        </div>
      </div>

      <div className="text-sm text-slate-600 mb-6 bg-slate-100 p-3 rounded-lg print:bg-transparent print:p-0 print:border-b print:border-slate-200 print:rounded-none">
        Contexto: Se analizan las Órdenes de Producción (OPs) listando únicamente la OP, el cliente, la referencia, la fecha y el margen.
      </div>

      {ordenes.length > 0 && (
        <div className="mb-10">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">Nro OP</th>
                <th className="py-2">Cliente</th>
                <th className="py-2">Referencia</th>
                <th className="py-2 text-right">Fecha</th>
                <th className="py-2 text-right">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ordenes.map((op, i) => {
                const isExtremelyCritical = op.margen_pct < (margenMinimo / 2);
                return (
                  <tr key={i} className="print:break-inside-avoid">
                    <td className={`py-2 font-semibold ${isExtremelyCritical ? 'text-red-900' : 'text-slate-800'}`}>{op.nro_op}</td>
                    <td className={`py-2 truncate max-w-xs ${isExtremelyCritical ? 'text-red-800' : 'text-slate-700'}`}>{op.cliente}</td>
                    <td className={`py-2 truncate max-w-[200px] ${isExtremelyCritical ? 'text-red-800' : 'text-slate-600'}`}>{op.referencia}</td>
                    <td className={`py-2 text-right ${isExtremelyCritical ? 'text-red-700' : 'text-slate-500'}`}>{new Date(op.fecha).toLocaleDateString('es-CO')}</td>
                    <td className={`py-2 text-right font-bold ${isExtremelyCritical ? 'text-red-700' : op.margen_pct < margenMinimo ? 'text-red-500' : 'text-emerald-600'}`}>{op.margen_pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </InformePDFModal>
  );
}
