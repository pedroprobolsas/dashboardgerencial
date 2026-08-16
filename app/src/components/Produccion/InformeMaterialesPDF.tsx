import type { LineaMaterial } from '../../services/api';
import InformePDFModal from './InformePDFModal';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const fmtNum4 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

interface Props {
  detalle: (LineaMaterial & { tipo_especial?: 'alias' | 'cotizado_sin_usar' | 'sustitucion' | 'consumo_extra' | 'normal' | null })[];
  fechaInicio: string;
  fechaFin: string;
  onClose: () => void;
}

export default function InformeMaterialesPDF({ detalle, fechaInicio, fechaFin, onClose }: Props) {
  
  const actividades = detalle.map(d => {
    // Para el informe nos centramos en el efecto cantidad (o impacto_final si no está)
    const cant = d.efecto_cantidad || 0;
    return { ...d, impacto: cant };
  });

  const sobrecostos = actividades.filter(a => a.tipo_especial === 'normal' && a.calculable && a.impacto < 0).sort((a, b) => a.impacto - b.impacto);
  const ahorros = actividades.filter(a => a.tipo_especial === 'normal' && a.calculable && a.impacto > 0).sort((a, b) => b.impacto - a.impacto);
  const especiales = actividades.filter(a => a.tipo_especial && a.tipo_especial !== 'normal');

  const totalSobrecosto = sobrecostos.reduce((acc, curr) => acc + curr.impacto, 0);
  const totalAhorro = ahorros.reduce((acc, curr) => acc + curr.impacto, 0);
  
  const uniqueOps = new Set(actividades.map(a => a.nro_op)).size;

  const infoExtra = (
    <>
      <p><span className="font-semibold w-24 inline-block">Período:</span> {fechaInicio} a {fechaFin}</p>
      <p><span className="font-semibold w-24 inline-block">Alcance:</span> Bodega y Consumos</p>
    </>
  );

  return (
    <InformePDFModal
      tipoInforme="Materiales"
      requestData={{
        responsable: 'Líder de Bodega', 
        tipo_efecto: 'cantidad',
        periodo_inicio: fechaInicio,
        periodo_fin: fechaFin
      }}
      titulo="Análisis de Consumo de Materiales"
      entidadLabel="Responsable:"
      entidadValue="Líder de Bodega"
      infoExtra={infoExtra}
      firmaLabel="Bodega / Inventario"
      onClose={onClose}
    >
      {/* Global Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8 mt-6">
        <div className="border-2 border-red-100 rounded-xl p-6 bg-red-50/50 print:bg-transparent print:border-red-600">
          <span className="text-sm font-bold text-red-600 uppercase tracking-wider block mb-2">Sobrecosto Cant.</span>
          <span className="text-3xl font-black text-red-600 tracking-tight">{fmtCOP.format(totalSobrecosto)}</span>
          <span className="text-sm font-medium text-slate-600 block mt-2">En {sobrecostos.length} consumos</span>
        </div>
        <div className="border-2 border-emerald-100 rounded-xl p-6 bg-emerald-50/50 print:bg-transparent print:border-emerald-600">
          <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider block mb-2">Ahorro Cant.</span>
          <span className="text-3xl font-black text-emerald-600 tracking-tight">+{fmtCOP.format(totalAhorro)}</span>
          <span className="text-sm font-medium text-slate-600 block mt-2">En {ahorros.length} consumos</span>
        </div>
        <div className="border-2 border-amber-100 rounded-xl p-6 bg-amber-50/50 print:bg-transparent print:border-amber-600">
          <span className="text-sm font-bold text-amber-600 uppercase tracking-wider block mb-2">Casos Especiales</span>
          <span className="text-3xl font-black text-amber-600 tracking-tight">{especiales.length}</span>
          <span className="text-sm font-medium text-slate-600 block mt-2">Alias / Sust. / No cot. / Consumo extra</span>
        </div>
      </div>

      <div className="text-sm text-slate-600 mb-6 bg-slate-100 p-3 rounded-lg print:bg-transparent print:p-0 print:border-b print:border-slate-200 print:rounded-none">
        Contexto: Se analizaron un total de <strong>{actividades.length}</strong> movimientos de materiales correspondientes a <strong>{uniqueOps}</strong> Órdenes de Producción (OP). Los consumos ejecutados se comparan directamente contra los cotizados sin ajuste por volumen de producción.
      </div>

      {/* Table - Sobrecostos */}
      {sobrecostos.length > 0 && (
        <div className="mb-10">
          <h3 className="text-lg font-bold text-red-700 border-b border-red-200 pb-2 mb-4">Materiales con sobrecosto por cantidad</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Material</th>
                <th className="py-2 text-right">Cant. Cot.</th>
                <th className="py-2 text-right">Cant. Ejec.</th>
                <th className="py-2 text-right">Efecto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sobrecostos.map((a, i) => (
                <tr key={i} className="print:break-inside-avoid">
                  <td className="py-2 font-semibold">{a.nro_op}</td>
                  <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.material}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum4.format(a.cant_cotizada)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtNum4.format(a.cant_ejecutada)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-red-600">{fmtCOP.format(a.impacto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table - Ahorros */}
      {ahorros.length > 0 && (
        <div className="mb-10 print:break-before-auto">
          <h3 className="text-lg font-bold text-emerald-700 border-b border-emerald-200 pb-2 mb-4">Materiales con ahorro por cantidad</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Material</th>
                <th className="py-2 text-right">Cant. Cot.</th>
                <th className="py-2 text-right">Cant. Ejec.</th>
                <th className="py-2 text-right">Efecto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ahorros.map((a, i) => (
                <tr key={i} className="print:break-inside-avoid">
                  <td className="py-2 font-semibold">{a.nro_op}</td>
                  <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.material}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum4.format(a.cant_cotizada)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtNum4.format(a.cant_ejecutada)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-emerald-600">+{fmtCOP.format(a.impacto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table - Especiales */}
      {especiales.length > 0 && (
        <div className="mb-12 print:break-before-auto">
          <h3 className="text-lg font-bold text-amber-700 border-b border-amber-200 pb-2 mb-4">Calidad de Registro (Casos Especiales)</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Material</th>
                <th className="py-2">Tipo</th>
                <th className="py-2 text-right">Cant. Cot.</th>
                <th className="py-2 text-right">Cant. Ejec.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {especiales.map((a, i) => {
                let tipo = 'Desconocido';
                if (a.tipo_especial === 'alias') tipo = 'Alias de catálogo';
                else if (a.tipo_especial === 'cotizado_sin_usar') tipo = 'Cotizado sin usar';
                else if (a.tipo_especial === 'sustitucion') tipo = 'Sustitución real';
                else if (a.tipo_especial === 'consumo_extra') tipo = 'Consumo extra';
                else if (!a.calculable) tipo = 'No calculable';

                return (
                  <tr key={i} className="print:break-inside-avoid">
                    <td className="py-2 font-semibold">{a.nro_op}</td>
                    <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.material}</td>
                    <td className="py-2 font-bold text-amber-700 text-xs">{tipo}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum4.format(a.cant_cotizada)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmtNum4.format(a.cant_ejecutada)}</td>
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
