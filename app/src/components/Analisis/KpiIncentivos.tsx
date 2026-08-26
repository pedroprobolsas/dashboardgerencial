import { useState, useEffect } from 'react';
import { fetchKpiIncentivos, type KpiIncentivo } from '../../services/api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function KpiIncentivos() {
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  
  const [datos, setDatos] = useState<KpiIncentivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchKpiIncentivos(anio, mes)
      .then(res => {
        if (active) setDatos(res);
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [anio, mes]);

  return (
    <div className="flex flex-col h-full bg-dashboard-bgMain">
      <div className="flex-none p-6 pb-2 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-dashboard-textMain">KPIs e Incentivos</h2>
          
          <div className="flex items-center space-x-2">
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
                {datos.map((d, i) => (
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
    </div>
  );
}
