import { useState, useEffect } from 'react';
import { useAuth } from '../Auth/AuthContext';

interface Pipeline {
  id: string;
  nombre: string;
  estado: string;
  ultima_fecha_datos: string | null;
  dias_atraso: number | null;
  mensaje: string;
  ultima_verificacion: string | null;
}

interface DataStatusResponse {
  verificado_en: string | null;
  resumen: {
    verde: number;
    amarillo: number;
    rojo: number;
    sin_datos: number;
  };
  pipelines: Pipeline[];
}

interface LockState {
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  locked_by: string;
  locked_at: string;
  elapsed_seconds: number | null;
}

export default function EstadoDatos() {
  const { user } = useAuth();
  const [data, setData] = useState<DataStatusResponse | null>(null);
  const [locks, setLocks] = useState<Record<string, LockState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pipelineToRetry, setPipelineToRetry] = useState<'crisolweb' | 'siigo_saldos' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchDataStatus = async () => {
    try {
      const res = await fetch('/api/data-status');
      if (!res.ok) throw new Error('Error al obtener estado de datos');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLockState = async () => {
    try {
      const res = await fetch('/api/data-status/lock-state');
      if (res.ok) {
        const json = await res.json();
        setLocks(json.locks || {});
        // Auto refresh data status si un lock se completó
        Object.values(json.locks || {}).forEach((lock: any) => {
          if (lock.status === 'completed' && lock.elapsed_seconds < 10) {
            fetchDataStatus();
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDataStatus();
    fetchLockState();
    
    // Polling dinámico: si hay algo in progress, poll cada 5s, sino cada 60s
    let intervalTime = 60000;
    const isAnyInProgress = Object.values(locks).some(l => l.status === 'in_progress');
    if (isAnyInProgress) intervalTime = 5000;
    
    const intervalData = setInterval(fetchDataStatus, 60000);
    const intervalLocks = setInterval(fetchLockState, intervalTime);
    
    return () => {
      clearInterval(intervalData);
      clearInterval(intervalLocks);
    };
  }, [locks]);

  const handleRetry = async () => {
    if (!pipelineToRetry) return;
    setModalOpen(false);
    
    try {
      const res = await fetch(`/api/data-status/retry/${pipelineToRetry}`, { method: 'POST' });
      if (res.status === 202) {
        setToast('Pipeline iniciado');
        setTimeout(() => setToast(null), 3000);
        fetchLockState(); // Refresh locks inmeditamente
      } else {
        const json = await res.json().catch(() => ({}));
        alert(`Error al iniciar retry: ${json.error || res.status}`);
      }
    } catch (e: any) {
      alert(`Error de conexión: ${e.message}`);
    }
  };

  const openModal = (type: 'crisolweb' | 'siigo_saldos') => {
    setPipelineToRetry(type);
    setModalOpen(true);
  };

  if (loading && !data) return <div className="p-8 text-center text-slate-400">Cargando estado de datos...</div>;
  if (error) return <div className="p-8 text-center text-red-400">Error: {error}</div>;
  if (!data) return null;

  const getStatusColor = (estado: string) => {
    if (estado === 'rojo') return 'bg-red-500';
    if (estado === 'amarillo') return 'bg-yellow-500';
    if (estado === 'verde') return 'bg-emerald-500';
    return 'bg-slate-500';
  };

  const renderRetryButton = (type: 'crisolweb' | 'siigo_saldos') => {
    if (user?.rol !== 'admin') return null;
    
    const lock = locks[type];
    const isRunning = lock?.status === 'in_progress';
    const isRecentlyCompleted = lock?.status === 'completed' && lock?.elapsed_seconds !== null && lock.elapsed_seconds < 30;

    if (isRunning) {
      const isMe = lock.locked_by === user.email;
      return (
        <button disabled className="mt-4 w-full py-2 bg-yellow-500/20 text-yellow-500 rounded text-sm font-medium border border-yellow-500/30 flex justify-center items-center gap-2">
          <span className="animate-spin text-lg leading-none">⏳</span>
          {isMe ? 'Ejecutando...' : `En progreso por ${lock.locked_by?.split('@')[0]} hace ${Math.floor((lock.elapsed_seconds || 0)/60)}m`}
        </button>
      );
    }
    
    if (isRecentlyCompleted) {
      return (
        <button disabled className="mt-4 w-full py-2 bg-emerald-500/20 text-emerald-500 rounded text-sm font-medium border border-emerald-500/30 flex justify-center items-center gap-2">
          <span>✅</span> Actualizado hace {lock.elapsed_seconds}s
        </button>
      );
    }

    return (
      <button 
        onClick={() => openModal(type)}
        className="mt-4 w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors flex justify-center items-center gap-2"
      >
        <span>🔄</span> Reintentar {type === 'crisolweb' ? 'Crisolweb' : 'SIIGO'}
      </button>
    );
  };

  return (
    <div className="space-y-6 relative">
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce">
          {toast}
        </div>
      )}

      {modalOpen && pipelineToRetry && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl max-w-md w-full shadow-xl border border-slate-700">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
              <span>⚠️</span> Ejecución Manual de Pipeline
            </h3>
            
            {pipelineToRetry === 'crisolweb' ? (
              <div className="text-slate-300 space-y-3 mb-6 text-sm">
                <p>Vas a ejecutar el pipeline completo de Crisolweb.</p>
                <p>Este proceso toma <strong>entre 10 y 15 minutos</strong>. Durante la ejecución:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Otros usuarios no podrán reintentar este proceso.</li>
                  <li>Cualquier extracción colgada actualmente será forzada a terminar (pkill).</li>
                </ul>
              </div>
            ) : (
              <div className="text-slate-300 space-y-3 mb-6 text-sm">
                <p>Vas a ejecutar la sincronización de SIIGO Saldos.</p>
                <p>Toma alrededor de <strong>5 minutos</strong>.</p>
              </div>
            )}
            
            <p className="text-white font-medium mb-6">¿Estás seguro de iniciar la extracción ahora?</p>
            
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleRetry} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium flex items-center gap-2 transition-colors">
                <span>🚀</span> Sí, Ejecutar ahora
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Estado de Datos</h2>
          <p className="text-slate-400 text-sm">
            Monitor de actualización de pipelines
            {data.verificado_en && ` • Última verificación: ${new Date(data.verificado_en).toLocaleString('es-CO')}`}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center p-3 bg-slate-800 rounded-xl min-w-[80px]">
            <span className="text-emerald-500 font-bold text-xl">{data.resumen.verde}</span>
            <span className="text-xs text-slate-400">Saludables</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-slate-800 rounded-xl min-w-[80px]">
            <span className="text-yellow-500 font-bold text-xl">{data.resumen.amarillo}</span>
            <span className="text-xs text-slate-400">Advertencia</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-slate-800 rounded-xl min-w-[80px]">
            <span className="text-red-500 font-bold text-xl">{data.resumen.rojo}</span>
            <span className="text-xs text-slate-400">Críticos</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.pipelines.map((p) => {
          const type = p.id.startsWith('crisolweb') || p.id === 'dashboard_ordenes_cumplidas' ? 'crisolweb' : 'siigo_saldos';
          
          return (
            <div key={p.id} className="bg-slate-800 rounded-xl p-5 border border-slate-700/50 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(p.estado)} shadow-sm shrink-0`} />
                  <h3 className="font-semibold text-slate-200 truncate" title={p.nombre}>{p.nombre}</h3>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Última data:</span>
                    <span className="text-slate-200 font-medium">
                      {p.ultima_fecha_datos ? new Date(p.ultima_fecha_datos + 'T00:00:00').toLocaleDateString('es-CO') : 'Desconocida'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Atraso:</span>
                    <span className={`font-medium ${p.estado === 'rojo' ? 'text-red-400' : p.estado === 'amarillo' ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {p.dias_atraso !== null ? `${p.dias_atraso} días hábiles` : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="mt-2 pt-3 border-t border-slate-700/50 text-xs text-slate-500 flex justify-between">
                  <span>Verificado:</span>
                  <span>{p.ultima_verificacion ? new Date(p.ultima_verificacion).toLocaleTimeString('es-CO') : 'Nunca'}</span>
                </div>
              </div>

              {renderRetryButton(type)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
