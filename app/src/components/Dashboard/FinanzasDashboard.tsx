import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
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
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  const [ventasSinIva, setVentasSinIva] = useState(0);
  const [costosProduccion, setCostosProduccion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para detalles completos
  const [detallesClases, setDetallesClases] = useState<Record<number, SaldoContableDetalle[]>>({});
  const [loadingDetalles, setLoadingDetalles] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [y, m] = fecha.split('-').map(Number);
        const resp = await fetchSaldosContables(undefined, undefined, y, m);
        if (!ignore) {
          setSaldos(resp.data);
          setUltimaActualizacion(resp.ultima_actualizacion);
          setVentasSinIva(resp.ventas_sin_iva || 0);
          setCostosProduccion(resp.costos_produccion || 0);
        }
      } catch (err: any) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  // Efecto para cargar los detalles de todas las tablas cuando cambia la fecha
  useEffect(() => {
    let ignore = false;
    async function loadDetalles() {
      setLoadingDetalles(true);
      try {
        const [y, m] = fecha.split('-');
        const primerDia = `${y}-${m.padStart(2, '0')}-01`;
        
        const promesas = [1, 2, 5, 6].map(clase => fetchSaldosContablesDetalle(clase, primerDia));
        const resultados = await Promise.all(promesas);
        
        if (!ignore) {
          setDetallesClases({
            1: resultados[0],
            2: resultados[1],
            5: resultados[2],
            6: resultados[3]
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!ignore) setLoadingDetalles(false);
      }
    }
    loadDetalles();
    return () => { ignore = true; };
  }, [fecha]);

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
  const patrimonioActual = activosActual + pasivosActual;

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
      ultimos.push({ mes: MESES[curM - 1].substring(0, 3), valor: act + pas });
    }
    return ultimos;
  }, [saldos, fecha]);

  const renderPorcentaje = (valor: number) => {
    if (!ventasSinIva || ventasSinIva === 0 || !valor) return <span className="text-slate-500">—</span>;
    const pct = (valor / ventasSinIva) * 100;
    const pctStr = pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct).toString();
    return <span className="text-slate-500 font-medium">{pctStr}% de ventas</span>;
  };

  const renderFlecha = (actual: number, anterior: number, inverso = false) => {
    if (!anterior) return null;
    
    // Para pasivos u otras cuentas inversas, usamos el valor absoluto 
    // porque un "aumento" significa aumento de deuda.
    const valActual = inverso ? Math.abs(actual) : actual;
    const valAnterior = inverso ? Math.abs(anterior) : anterior;
    
    const dif = valActual - valAnterior;
    if (dif === 0) return <span className="text-slate-400">sin cambios</span>;
    
    const pctReal = Math.abs((dif / valAnterior) * 100);
    // Mostrar 1 decimal si es menor a 1%, sino redondear a entero
    const pctStr = pctReal < 1 ? pctReal.toFixed(1) : Math.round(pctReal).toString();
    
    if (pctStr === '0.0' || pctStr === '0') {
      return <span className="text-slate-400">sin cambios</span>;
    }
    
    const esAumento = dif > 0;
    // inverso = true (Pasivos): si aumenta la deuda (esAumento=true), es rojo (malo). Si baja (esAumento=false), es verde (bueno).
    // inverso = false (Activos): si aumenta (esAumento=true), es verde (bueno). Si baja (esAumento=false), es rojo (malo).
    const esVerde = inverso ? !esAumento : esAumento;
    
    return (
      <span className={`flex items-center gap-1 ${esVerde ? 'text-emerald-600' : 'text-red-600'}`}>
        {esAumento ? '↑' : '↓'} {pctStr}% vs mes ant.
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
            {ultimaActualizacion ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                Actualizado {new Date(ultimaActualizacion).toLocaleDateString('es-CO', { timeZone: 'UTC' })}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wide border border-slate-200 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-slate-400" />
                Sin datos
              </span>
            )}
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
             <span className="block mb-3 text-red-400"><AlertTriangle size={36} /></span>
             <p className="text-red-500 font-medium text-sm mb-1">No se pudo obtener la información</p>
             <p className="text-xs text-dashboard-textMuted">{error}</p>
           </div>
        ) : (
          <>
            {/* 5 Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                subtext={renderPorcentaje(gastosActual)}
              />
              <MetricCard 
                title="Costos de Venta" 
                value={costosActual} 
                subtext={renderPorcentaje(costosActual)}
              />
              <MetricCard 
                title="Cost. Producción" 
                value={costosProduccion} 
                subtext={renderPorcentaje(costosProduccion)}
              />
            </div>

            {/* Patrimonio Neto */}
            <div className="bg-white rounded-2xl border-l-4 border-l-probolsas-cyan border-y border-r border-slate-200 p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Patrimonio Neto (Activos - Pasivos)</p>
                <p className="text-2xl font-bold text-slate-800">{fmtCOP.format(patrimonioActual)}</p>
              </div>
              
              <div className="flex items-end gap-2 h-12">
                {evolucionPatrimonio.map((p, i) => {
                  const max = Math.max(...evolucionPatrimonio.map(x => x.valor));
                  const hPct = max > 0 ? Math.max((p.valor / max) * 100, 10) : 10;
                  return (
                    <div key={i} className="flex flex-col items-center justify-end h-full gap-1 group relative">
                      <div className="w-8 bg-probolsas-cyan/80 rounded-sm hover:bg-probolsas-cyan transition-colors mt-auto" style={{ height: `${hPct}%` }}></div>
                      <span className="text-[10px] text-slate-400 font-medium">{p.mes}</span>
                      <div className="absolute -top-8 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
                        {fmtCOP.format(p.valor)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detalle por rubro: 4 Tablas Paralelas (Grid 2x2) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
              {[1, 2, 5, 6].map((claseNum) => {
                const title = CLASES[claseNum as keyof typeof CLASES];
                const valorTotal = getValorClase(dataActual, claseNum);
                const cuentas = detallesClases[claseNum] || [];
                
                return (
                  <div key={claseNum} className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px]">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 rounded-t-2xl">
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
                      <span className="font-bold text-indigo-700">{fmtCOP.format(valorTotal)}</span>
                    </div>
                    
                    <div className="flex-1 overflow-auto relative">
                      {loadingDetalles ? (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-sm text-slate-400 animate-pulse">Cargando cuentas...</span>
                        </div>
                      ) : cuentas.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-sm text-slate-400">Sin datos para el período seleccionado</span>
                        </div>
                      ) : (
                        <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                          <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="px-4 py-3 font-semibold bg-slate-50">Cuenta</th>
                              <th className="px-4 py-3 font-semibold bg-slate-50">Concepto</th>
                              <th className="px-4 py-3 font-semibold text-right bg-slate-50">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {cuentas
                              .sort((a, b) => Math.abs(parseFloat(b.valor)) - Math.abs(parseFloat(a.valor)))
                              .map(d => (
                              <tr key={d.codigo_cuenta} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2.5 font-medium text-slate-700 w-24">{d.codigo_cuenta}</td>
                                <td className="px-4 py-2.5 truncate max-w-[180px]" title={d.nombre_cuenta}>{d.nombre_cuenta}</td>
                                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-800">{fmtCOP.format(parseFloat(d.valor))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })}
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
