import { useState, useEffect, useMemo } from 'react';
import { fetchSaldosContables, fetchSaldosContablesDetalle, type SaldoContable, type SaldoContableDetalle } from '../../services/api';

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const CLASES = {
  1: 'Activos',
  2: 'Pasivos',
  5: 'Gastos',
  6: 'Costos de Venta'
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function FinanzasDashboard() {
  const [fecha, setFecha] = useState(() => {
    return '2026-03';
  });

  const [saldos, setSaldos] = useState<SaldoContable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para detalles
  const [detalleClase, setDetalleClase] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<SaldoContableDetalle[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSaldosContables();
        if (!ignore) setSaldos(data);
      } catch (err: any) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  const dataActual = useMemo(() => {
    const [y, m] = fecha.split('-');
    return saldos.filter(s => {
      const d = new Date(s.fecha);
      return d.getUTCFullYear() === parseInt(y, 10) && (d.getUTCMonth() + 1) === parseInt(m, 10);
    });
  }, [saldos, fecha]);

  const getValorClase = (datos: SaldoContable[], clase: number) => {
    const item = datos.find(d => Number(d.clase) === clase);
    return item ? parseFloat(item.valor) : 0;
  };

  const activosActual = getValorClase(dataActual, 1);
  const pasivosActual = getValorClase(dataActual, 2);
  const gastosActual = getValorClase(dataActual, 5);
  const costosActual = getValorClase(dataActual, 6);
  const patrimonioActual = activosActual - pasivosActual;

  const dataAnterior = useMemo(() => {
    const [y, m] = fecha.split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM === 0) {
      prevM = 12;
      prevY--;
    }
    return saldos.filter(s => {
      const d = new Date(s.fecha);
      return d.getUTCFullYear() === prevY && (d.getUTCMonth() + 1) === prevM;
    });
  }, [saldos, fecha]);

  const activosAnterior = getValorClase(dataAnterior, 1);
  const pasivosAnterior = getValorClase(dataAnterior, 2);

  const evolucionPatrimonio = useMemo(() => {
    const [y, m] = fecha.split('-').map(Number);
    const ultimos = [];
    for (let i = 2; i >= 0; i--) {
      let curY = y;
      let curM = m - i;
      if (curM <= 0) {
        curM += 12;
        curY--;
      }
      const mesData = saldos.filter(s => {
        const d = new Date(s.fecha);
        return d.getUTCFullYear() === curY && (d.getUTCMonth() + 1) === curM;
      });
      const act = getValorClase(mesData, 1);
      const pas = getValorClase(mesData, 2);
      ultimos.push({ mes: MESES[curM - 1].substring(0, 3), valor: act - pas });
    }
    return ultimos;
  }, [saldos, fecha]);

  const toggleDetalle = async (clase: number) => {
    if (detalleClase === clase) {
      setDetalleClase(null);
      return;
    }
    setDetalleClase(clase);
    setLoadingDetalle(true);
    try {
      const [y, m] = fecha.split('-');
      const primerDia = `${y}-${m.padStart(2, '0')}-01`;
      const result = await fetchSaldosContablesDetalle(clase, primerDia);
      setDetalles(result);
    } catch (e) {
      console.error(e);
      setDetalles([]);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const renderFlecha = (actual: number, anterior: number, inverso = false) => {
    if (!anterior) return null;
    const dif = actual - anterior;
    if (dif === 0) return <span className="text-slate-400">igual</span>;
    const esPositivo = dif > 0;
    const esVerde = inverso ? !esPositivo : esPositivo;
    return (
      <span className={`flex items-center gap-1 ${esVerde ? 'text-emerald-600' : 'text-red-600'}`}>
        {esPositivo ? '↑' : '↓'} {Math.abs(Math.round((dif / anterior) * 100))}% vs mes ant.
      </span>
    );
  };

  const labelMes = MESES[parseInt(fecha.split('-')[1], 10) - 1];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0 flex flex-wrap gap-4 justify-between items-end">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-dashboard-textMain">Finanzas</h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide border border-emerald-200">
              ✅ Actualizado hoy
            </span>
          </div>
          <p className="text-sm text-dashboard-textMuted mt-1 capitalize">{labelMes} {fecha.split('-')[0]}</p>
        </div>
        
        <div className="flex flex-col">
          <label className="text-[10px] font-semibold text-dashboard-textMuted mb-1 uppercase tracking-wider">Período</label>
          <input 
            type="month" 
            value={fecha} 
            onChange={e => setFecha(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-dashboard-textMain bg-slate-50 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 flex flex-col gap-6">
        {loading ? (
           <div className="p-16 text-center text-slate-500 animate-pulse">Cargando saldos contables...</div>
        ) : error ? (
           <div className="p-16 text-center flex flex-col items-center">
             <span className="text-3xl block mb-2">⚠️</span>
             <p className="text-red-500 font-medium text-sm mb-1">No se pudo obtener la información</p>
             <p className="text-xs text-dashboard-textMuted">{error}</p>
           </div>
        ) : (
          <>
            {/* 4 Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard 
                title="Activos" 
                value={activosActual} 
                subtext={renderFlecha(activosActual, activosAnterior, false)}
              />
              <MetricCard 
                title="Pasivos" 
                value={pasivosActual} 
                subtext={renderFlecha(pasivosActual, pasivosAnterior, true)} 
              />
              <MetricCard 
                title="Gastos del Mes" 
                value={gastosActual} 
                subtext={<span className="text-slate-500">acumulado {labelMes}</span>}
              />
              <MetricCard 
                title="Costos de Venta" 
                value={costosActual} 
                subtext={<span className="text-slate-500">acumulado {labelMes}</span>}
              />
            </div>

            {/* Patrimonio Neto */}
            <div className="bg-white rounded-2xl border-l-4 border-l-probolsas-cyan border-y border-r border-slate-200 p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Patrimonio Neto (Activos - Pasivos)</p>
                <p className="text-2xl font-bold text-slate-800">{fmtCOP.format(patrimonioActual)}</p>
              </div>
              
              {/* Sparkline */}
              <div className="flex items-end gap-2 h-12">
                {evolucionPatrimonio.map((p, i) => {
                  const max = Math.max(...evolucionPatrimonio.map(x => x.valor));
                  const hPct = max > 0 ? Math.max((p.valor / max) * 100, 10) : 10;
                  return (
                    <div key={i} className="flex flex-col items-center justify-end h-full gap-1 group relative">
                      <div className="w-8 bg-probolsas-cyan/80 rounded-sm hover:bg-probolsas-cyan transition-colors mt-auto" style={{ height: `${hPct}%` }}></div>
                      <span className="text-[10px] text-slate-400 font-medium">{p.mes}</span>
                      {/* Tooltip */}
                      <div className="absolute -top-8 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
                        {fmtCOP.format(p.valor)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detalle por rubro */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mt-2 flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-dashboard-textMain">Detalle por rubro</h3>
              </div>
              
              <div className="divide-y divide-slate-100">
                {[1, 2, 5, 6].map((claseNum) => {
                  const title = CLASES[claseNum as keyof typeof CLASES];
                  const isOpen = detalleClase === claseNum;
                  const valorTotal = getValorClase(dataActual, claseNum);
                  
                  return (
                    <div key={claseNum} className="flex flex-col">
                      <button 
                        onClick={() => toggleDetalle(claseNum)}
                        className="flex justify-between items-center px-6 py-4 hover:bg-slate-50 transition-colors w-full text-left focus:outline-none"
                      >
                        <span className="font-semibold text-dashboard-textMain">{title}</span>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-slate-700">{fmtCOP.format(valorTotal)}</span>
                          <span className={`text-slate-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                        </div>
                      </button>
                      
                      {isOpen && (
                        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100">
                          {loadingDetalle ? (
                            <div className="text-xs text-slate-500 animate-pulse text-center py-4">Cargando cuentas...</div>
                          ) : detalles.length === 0 ? (
                            <div className="text-xs text-slate-500 text-center py-4">No hay datos detallados para esta clase en este período.</div>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-[10px] uppercase text-slate-500 tracking-wider border-b border-slate-100">
                                  <th className="pb-2 font-semibold">Código</th>
                                  <th className="pb-2 font-semibold">Cuenta</th>
                                  <th className="pb-2 text-right font-semibold">Valor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {detalles
                                  .sort((a, b) => Math.abs(parseFloat(b.valor)) - Math.abs(parseFloat(a.valor)))
                                  .slice(0, 10)
                                  .map(d => (
                                  <tr key={d.codigo_cuenta} className="group hover:bg-white transition-colors">
                                    <td className="py-2.5 text-slate-500 w-24 font-mono text-xs">{d.codigo_cuenta}</td>
                                    <td className="py-2.5 font-medium text-slate-700 truncate max-w-xs">{d.nombre_cuenta}</td>
                                    <td className="py-2.5 text-right text-slate-800 font-semibold tabular-nums">{fmtCOP.format(parseFloat(d.valor))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtext }: { title: string, value: number, subtext: React.ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</span>
      <span className="text-3xl font-bold text-slate-800 truncate mb-1">{fmtCOP.format(value)}</span>
      <div className="text-[11px] font-bold mt-auto leading-tight">
        {subtext}
      </div>
    </div>
  );
}
