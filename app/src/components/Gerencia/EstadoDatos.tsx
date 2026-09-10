import { useState, useEffect } from 'react';

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

export default function EstadoDatos() {
  const [data, setData] = useState<DataStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchDataStatus();
    const interval = setInterval(fetchDataStatus, 60000); // Auto-refresh cada 60s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) return <div className="p-8 text-center text-slate-400">Cargando estado de datos...</div>;
  if (error) return <div className="p-8 text-center text-red-400">Error: {error}</div>;
  if (!data) return null;

  const getStatusColor = (estado: string) => {
    if (estado === 'rojo') return 'bg-red-500';
    if (estado === 'amarillo') return 'bg-yellow-500';
    if (estado === 'verde') return 'bg-emerald-500';
    return 'bg-slate-500';
  };

  return (
    <div className="space-y-6">
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
        {data.pipelines.map((p) => (
          <div key={p.id} className="bg-slate-800 rounded-xl p-5 border border-slate-700/50 flex flex-col gap-3">
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
        ))}
      </div>
    </div>
  );
}
