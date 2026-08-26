import { useState, useEffect, useMemo } from 'react';
import { fetchKpiIncentivos, type KpiIncentivo } from '../../services/api';
import InformePDFModal from '../Produccion/InformePDFModal';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function KpiIncentivos() {
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  const [liderSeleccionado, setLiderSeleccionado] = useState<string>('');
  
  const [datos, setDatos] = useState<KpiIncentivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [informeAbierto, setInformeAbierto] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchKpiIncentivos(anio, mes)
      .then(res => {
        if (active) {
          setDatos(res);
          // Si el lider seleccionado ya no existe en la data nueva, resetear
          if (liderSeleccionado && !res.find(d => d.lider === liderSeleccionado)) {
            setLiderSeleccionado('');
          }
        }
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [anio, mes]);

  const lideres = useMemo(() => Array.from(new Set(datos.map(d => d.lider))), [datos]);
  const datosFiltrados = useMemo(() => {
    return liderSeleccionado ? datos.filter(d => d.lider === liderSeleccionado) : datos;
  }, [datos, liderSeleccionado]);

  return (
    <div className="flex flex-col h-full bg-dashboard-bgMain">
      <div className="flex-none p-6 pb-2 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-dashboard-textMain">KPIs e Incentivos</h2>
          
          <div className="flex items-center space-x-2">
            <select
              value={liderSeleccionado}
              onChange={e => setLiderSeleccionado(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded text-sm text-dashboard-textMain focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Todos los líderes</option>
              {lideres.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select 
              value={anio} 
              onChange={e => setAnio(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 border border-slate-300 rounded text-sm text-dashboard-textMain focus:ring-1 focus:ring-slate-500"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select 
              value={mes} 
              onChange={e => setMes(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 border border-slate-300 rounded text-sm text-dashboard-textMain focus:ring-1 focus:ring-slate-500"
            >
              {MESES.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            {liderSeleccionado && (
              <button
                onClick={() => setInformeAbierto(true)}
                className="ml-2 px-4 py-1.5 bg-probolsas-cyan text-white text-sm font-medium rounded hover:bg-cyan-600 transition-colors shadow-sm"
              >
                Generar Informe
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <p className="text-sm text-slate-500">Cargando datos...</p>
        ) : error ? (
          <p className="text-sm text-red-600">Error: {error}</p>
        ) : datos.length === 0 ? (
          <p className="text-sm text-slate-500">No hay KPIs definidos para este período.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold tracking-wider">
                  <th className="py-3 px-4 uppercase">Líder</th>
                  <th className="py-3 px-4 uppercase">KPI</th>
                  <th className="py-3 px-4 uppercase text-center">OPs Dentro</th>
                  <th className="py-3 px-4 uppercase text-center">OPs Fuera</th>
                  <th className="py-3 px-4 uppercase text-right">Incentivo Total</th>
                  <th className="py-3 px-4 uppercase w-1/3">Recomendación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datosFiltrados.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50 text-sm text-dashboard-textMain transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">{d.lider}</td>
                    <td className="py-3 px-4">{d.kpi} <span className="text-xs text-slate-400 block">{d.tipo_calculo}</span></td>
                    {d.estado === 'no implementado' ? (
                      <td colSpan={4} className="py-3 px-4 text-slate-400 italic">Cálculo no implementado</td>
                    ) : (
                      <>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
                            {d.ops_dentro}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">
                            {d.ops_fuera}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${(d.incentivo_total || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(d.incentivo_total || 0)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 leading-relaxed text-xs">{d.recomendacion}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {informeAbierto && liderSeleccionado && (
        <InformePDFModal
          tipoInforme="KPI_INCENTIVOS"
          requestData={{ lider: liderSeleccionado, anio, mes }}
          titulo="Informe de KPIs e Incentivos"
          entidadLabel="Líder:"
          entidadValue={liderSeleccionado}
          infoExtra={<span className="text-sm font-medium text-slate-600">Período: {MESES[mes - 1]} {anio}</span>}
          onClose={() => setInformeAbierto(false)}
        >
          <div className="mt-6 mb-8">
            <h4 className="font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Detalle de KPIs Evaluados</h4>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-4 font-semibold">KPI</th>
                    <th className="py-2 px-4 font-semibold text-center">OPs Dentro</th>
                    <th className="py-2 px-4 font-semibold text-center">OPs Fuera</th>
                    <th className="py-2 px-4 font-semibold text-right">Incentivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {datosFiltrados.map((d, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-4 text-slate-900">{d.kpi}</td>
                      <td className="py-2 px-4 text-center text-slate-700">{d.ops_dentro ?? '-'}</td>
                      <td className="py-2 px-4 text-center text-slate-700">{d.ops_fuera ?? '-'}</td>
                      <td className="py-2 px-4 text-right font-medium text-slate-900">
                        {d.estado !== 'no implementado' 
                          ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(d.incentivo_total || 0)
                          : 'N/A'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-8">
              <h4 className="font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">Recomendaciones y Observaciones</h4>
              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700">
                {datosFiltrados.filter(d => d.recomendacion).map((d, idx) => (
                  <li key={idx}><strong>{d.kpi}:</strong> {d.recomendacion}</li>
                ))}
              </ul>
            </div>
          </div>
        </InformePDFModal>
      )}
    </div>
  );
}
