import { useState } from 'react';
import type { LineaMaterial } from '../../services/api';
import InformePDFModal from './InformePDFModal';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const fmtNum4 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

interface Props {
  detalle: (LineaMaterial & { tipo_especial?: 'alias' | 'cotizado_sin_usar' | 'sustitucion' | 'consumo_extra' | 'normal' | null })[];
  fechaInicio: string;
  fechaFin: string;
  filtroEspecial?: 'alias' | 'cotizado_sin_usar' | 'sustitucion' | 'consumo_extra' | null;
  onClose: () => void;
}

export default function InformeMaterialesPDF({ detalle, fechaInicio, fechaFin, filtroEspecial, onClose }: Props) {
  const [colaborador, setColaborador] = useState('');
  
  const actividades = detalle.map(d => {
    // Usamos el impacto final (ajustado por volumen) para agrupar, igual que en la vista principal
    const cant = (d as any).impacto_final || 0;
    return { ...d, impacto: cant };
  });

  const sobrecostos = actividades.filter(a => a.tipo_especial === 'normal' && a.calculable && a.impacto < 0).sort((a, b) => a.impacto - b.impacto);
  const ahorros = actividades.filter(a => a.tipo_especial === 'normal' && a.calculable && a.impacto > 0).sort((a, b) => b.impacto - a.impacto);
  
  let especiales = actividades.filter(a => a.tipo_especial && a.tipo_especial !== 'normal');
  if (filtroEspecial) {
    especiales = especiales.filter(a => a.tipo_especial === filtroEspecial);
  }

  const totalSobrecosto = sobrecostos.reduce((acc, curr) => acc + curr.impacto, 0);
  const totalAhorro = ahorros.reduce((acc, curr) => acc + curr.impacto, 0);
  
  const uniqueOps = new Set(actividades.map(a => a.nro_op)).size;

  const infoExtra = (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex items-center gap-2">
        <span className="font-semibold w-24">Dirigido a:</span>
        <input 
          type="text" 
          value={colaborador}
          onChange={e => setColaborador(e.target.value)}
          placeholder="Nombre del colaborador..."
          className="px-2 py-0.5 border border-slate-200 rounded text-slate-700 text-sm focus:outline-none focus:border-probolsas-cyan w-64 print:border-none print:p-0 print:w-auto font-bold print:font-bold bg-slate-50 print:bg-transparent placeholder:font-normal"
        />
      </div>
      <p><span className="font-semibold w-24 inline-block">Período:</span> {fechaInicio} a {fechaFin}</p>
      <p><span className="font-semibold w-24 inline-block">Alcance:</span> Bodega y Consumos</p>
    </div>
  );

  let tituloReporte = "Análisis de Consumo de Materiales";
  if (filtroEspecial === 'alias') tituloReporte = "Casos Especiales: Alias de Catálogo";
  if (filtroEspecial === 'cotizado_sin_usar') tituloReporte = "Casos Especiales: Cotizado sin usar";
  if (filtroEspecial === 'sustitucion') tituloReporte = "Casos Especiales: Sustitución Real";
  if (filtroEspecial === 'consumo_extra') tituloReporte = "Casos Especiales: Consumo no presupuestado";

  return (
    <InformePDFModal
      tipoInforme="Materiales"
      requestData={{
        responsable: 'Líder de Bodega', 
        tipo_efecto: 'cantidad',
        periodo_inicio: fechaInicio,
        periodo_fin: fechaFin,
        filtro_especial: filtroEspecial
      }}
      titulo={tituloReporte}
      entidadLabel="Responsable:"
      entidadValue="Líder de Bodega"
      infoExtra={infoExtra}
      firmaLabel="Bodega / Inventario"
      onClose={onClose}
    >
      {/* Global Cards (hide if specific filter) */}
      {!filtroEspecial && (
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
            <span className="text-3xl font-black text-amber-600 tracking-tight">{actividades.filter(a => a.tipo_especial && a.tipo_especial !== 'normal').length}</span>
            <span className="text-sm font-medium text-slate-600 block mt-2">Alias / Sust. / No cot. / Consumo extra</span>
          </div>
        </div>
      )}

      {filtroEspecial && (
        <div className="mb-8 mt-6">
          <div className="border-2 border-slate-200 rounded-xl p-6 bg-slate-50 print:bg-transparent print:border-slate-800">
            <span className="text-sm font-bold text-slate-700 uppercase tracking-wider block mb-2">Total Registros</span>
            <span className="text-3xl font-black text-slate-900 tracking-tight">{especiales.length}</span>
            <span className="text-sm font-medium text-slate-600 block mt-2">Materiales detectados en este período</span>
          </div>
        </div>
      )}

      <div className="text-sm text-slate-600 mb-6 bg-slate-100 p-3 rounded-lg print:bg-transparent print:p-0 print:border-b print:border-slate-200 print:rounded-none">
        Contexto: Se analizaron un total de <strong>{actividades.length}</strong> movimientos de materiales correspondientes a <strong>{uniqueOps}</strong> Órdenes de Producción (OP). El reporte agrupa los materiales basándose en su <strong>Impacto Ajustado</strong> por el volumen de producción real, resolviendo las diferencias con el cumplimiento bruto.
      </div>

      {/* Table - Sobrecostos */}
      {!filtroEspecial && sobrecostos.length > 0 && (
        <div className="mb-10">
          <h3 className="text-lg font-bold text-red-700 border-b border-red-200 pb-2 mb-4">Materiales con sobrecosto por cantidad</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Material</th>
                <th className="py-2 text-right">Cant. Cot.</th>
                <th className="py-2 text-right">Cant. Ejec.</th>
                <th className="py-2 text-right" title="Valor bruto sin ajustar por volumen">Cumplimiento</th>
                <th className="py-2 text-right" title="Impacto real ajustado por el volumen de la OP">Impacto Ajustado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sobrecostos.map((a, i) => (
                <tr key={i} className="print:break-inside-avoid">
                  <td className="py-2 font-semibold">{a.nro_op}</td>
                  <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.material}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum4.format(a.cant_cotizada)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtNum4.format(a.cant_ejecutada)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtCOP.format(a.cumplimiento as number)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-red-600">{fmtCOP.format(a.impacto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table - Ahorros */}
      {!filtroEspecial && ahorros.length > 0 && (
        <div className="mb-10 print:break-before-auto">
          <h3 className="text-lg font-bold text-emerald-700 border-b border-emerald-200 pb-2 mb-4">Materiales con ahorro por cantidad</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-xs border-b-2 border-slate-200">
                <th className="py-2">OP</th>
                <th className="py-2">Material</th>
                <th className="py-2 text-right">Cant. Cot.</th>
                <th className="py-2 text-right">Cant. Ejec.</th>
                <th className="py-2 text-right" title="Valor bruto sin ajustar por volumen">Cumplimiento</th>
                <th className="py-2 text-right" title="Impacto real ajustado por el volumen de la OP">Impacto Ajustado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ahorros.map((a, i) => (
                <tr key={i} className="print:break-inside-avoid">
                  <td className="py-2 font-semibold">{a.nro_op}</td>
                  <td className="py-2 text-slate-700 truncate max-w-[200px]">{a.material}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtNum4.format(a.cant_cotizada)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtNum4.format(a.cant_ejecutada)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{fmtCOP.format(a.cumplimiento as number)}</td>
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
