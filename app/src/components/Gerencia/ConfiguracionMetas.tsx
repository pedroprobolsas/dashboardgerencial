import { useState, useEffect } from 'react';
import { fetchParametros, fetchHistorialParametros, updateParametro, type Parametro } from '../../services/api';

import { useAuth } from '../Auth/AuthContext';
import MetasMensualesGrid from './MetasMensualesGrid';
import TarjetasDashboardConfig from './TarjetasDashboardConfig';

export default function ConfiguracionMetas() {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'admin';

  const [parametros, setParametros] = useState<Record<string, Parametro>>({});
  const [historico, setHistorico] = useState<Parametro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [editando, setEditando] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  
  const [claveHistorial, setClaveHistorial] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    setError(null);
    try {
      const [params, hist] = await Promise.all([
        fetchParametros(),
        fetchHistorialParametros()
      ]);
      setParametros(params);
      setHistorico(hist);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los parámetros');
    } finally {
      setLoading(false);
    }
  }

  async function handleGuardar(clave: string) {
    if (!editValor || isNaN(Number(editValor))) return;
    setGuardando(true);
    try {
      await updateParametro(clave, Number(editValor));
      await cargarDatos();
      setEditando(null);
    } catch (err: any) {
      const msg = err.message || 'Error al guardar';
      alert(`No se pudo guardar: ${msg}`);
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-10 flex justify-center">
        <p className="text-slate-500 animate-pulse">Cargando configuración...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl">
          <h2 className="font-bold text-lg mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const agrupados = Object.entries(parametros).reduce((acc, [clave, p]) => {
    const cat = p.categoria || 'Otros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({ ...p, clave });
    return acc;
  }, {} as Record<string, Parametro[]>);

  const categorias = Object.keys(agrupados).sort();

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800">Configuración de Metas y Umbrales</h2>
        <p className="text-slate-500 mt-2">Administra los parámetros dinámicos del sistema. Los cambios conservan el historial para que los reportes de meses pasados no se alteren.</p>
      </header>

      <div className="space-y-8">
        {categorias.map(categoria => (
          <section key={categoria} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-800">{categoria}</h3>
            </div>
            
            <div className="divide-y divide-slate-100">
              {agrupados[categoria].map(param => (
                <div key={param.clave} className="px-6 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-700 font-mono text-sm">{param.clave}</span>
                        {param.modificado_en && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            Vigente desde: {new Date(param.vigente_desde).toLocaleDateString('es-CO')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{param.descripcion}</p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {editando === param.clave ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={editValor}
                            onChange={e => setEditValor(e.target.value)}
                            className="w-24 text-right px-3 py-1.5 border border-probolsas-cyan rounded-lg focus:outline-none focus:ring-2 focus:ring-probolsas-cyan/30"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleGuardar(param.clave!)}
                          />
                          <span className="text-slate-500 font-medium">{param.unidad}</span>
                          <button 
                            onClick={() => handleGuardar(param.clave!)}
                            disabled={guardando}
                            className="ml-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                          >
                            ✓
                          </button>
                          <button 
                            onClick={() => setEditando(null)}
                            disabled={guardando}
                            className="text-slate-400 hover:text-slate-600 px-2 text-xl"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-xl font-black text-probolsas-navy mr-1">{param.valor}</span>
                            <span className="text-sm font-medium text-slate-500">{param.unidad}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditValor(String(param.valor));
                                  setEditando(param.clave!);
                                }}
                                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-md font-semibold transition-colors"
                              >
                                Editar
                              </button>
                            )}

                            <button
                              onClick={() => setClaveHistorial(claveHistorial === param.clave ? null : param.clave!)}
                              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${claveHistorial === param.clave ? 'bg-probolsas-navy text-white' : 'text-probolsas-cyan hover:bg-sky-50'}`}
                            >
                              Historial
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Historial expandible */}
                  {claveHistorial === param.clave && (
                    <div className="mt-4 pt-4 border-t border-dashed border-slate-200 bg-slate-50/50 p-4 rounded-xl">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Historial de cambios</h4>
                      <div className="space-y-2">
                        {historico.filter(h => h.clave === param.clave).map(h => (
                          <div key={h.id} className={`flex items-center justify-between text-sm p-2 rounded-lg ${h.vigente_hasta ? 'bg-white border border-slate-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                            <div className="flex items-center gap-4">
                              <span className="font-mono font-bold w-16 text-right">{h.valor} {h.unidad}</span>
                              <div className="flex flex-col">
                                <span className="text-slate-600 text-xs">
                                  {new Date(h.vigente_desde).toLocaleDateString('es-CO')} - {h.vigente_hasta ? new Date(h.vigente_hasta).toLocaleDateString('es-CO') : 'Actualidad'}
                                </span>
                                <span className="text-[10px] text-slate-400">Por: {h.modificado_por}</span>
                              </div>
                            </div>
                            {!h.vigente_hasta && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Vigente</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <MetasMensualesGrid />
      <TarjetasDashboardConfig />
    </div>
  );
}
