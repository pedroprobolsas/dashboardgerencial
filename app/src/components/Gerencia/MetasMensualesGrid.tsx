import React, { useState, useEffect, useMemo } from 'react';
import { fetchMetasMensuales, saveMetasMensualesBulk, duplicateMetasMensuales, fetchMetasMensualesAnios, type MetaMensual } from '../../services/api';
import { useAuth } from '../Auth/AuthContext';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function MetasMensualesGrid() {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'admin';

  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const [anioSeleccionado, setAnioSeleccionado] = useState(anioActual);
  const [metas, setMetas] = useState<{ [mes: number]: string }>({});
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Opción para que admin pueda editar histórico
  const [desbloquearHistorico, setDesbloquearHistorico] = useState(false);

  // Años disponibles: mínimo año actual - 1, actual y actual + 1, más los que vengan de DB
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([anioActual - 1, anioActual, anioActual + 1]);

  useEffect(() => {
    cargarAnios();
  }, []);

  async function cargarAnios() {
    try {
      const aniosDB = await fetchMetasMensualesAnios();
      const combo = new Set([...aniosDB, anioActual - 1, anioActual, anioActual + 1]);
      setAniosDisponibles(Array.from(combo).sort((a, b) => b - a)); // Orden descendente
    } catch (err) {
      console.error('Error cargando años:', err);
    }
  }

  useEffect(() => {
    cargarMetas(anioSeleccionado);
    setDesbloquearHistorico(false);
  }, [anioSeleccionado]);

  async function cargarMetas(anio: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetasMensuales(anio, 'ventas');
      const newMetas: { [mes: number]: string } = {};
      data.forEach(m => {
        newMetas[m.mes] = m.valor.toString();
      });
      setMetas(newMetas);
    } catch (err: any) {
      setError(err.message || 'Error al cargar metas mensuales');
    } finally {
      setLoading(false);
    }
  }

  function handleMetaChange(mes: number, val: string) {
    setMetas(prev => ({ ...prev, [mes]: val }));
  }

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      // Preparar payload
      const payload = [];
      for (let i = 1; i <= 12; i++) {
        const valStr = metas[i];
        if (valStr !== undefined && valStr !== '') {
          payload.push({ mes: i, valor: Number(valStr) });
        }
      }
      
      await saveMetasMensualesBulk(anioSeleccionado, payload, 'ventas');
      alert('Metas guardadas exitosamente');
      await cargarMetas(anioSeleccionado);
    } catch (err: any) {
      setError(err.message || 'Error al guardar metas');
    } finally {
      setGuardando(false);
    }
  }

  async function handleDuplicar() {
    if (!isAdmin) {
      alert('Solo los administradores pueden duplicar metas.');
      return;
    }
    const anioOrigen = anioSeleccionado - 1;
    if (!window.confirm(`¿Intentar copiar las metas de ${anioOrigen} hacia ${anioSeleccionado}?`)) return;

    setLoading(true);
    setError(null);
    try {
      await duplicateMetasMensuales(anioOrigen, anioSeleccionado, false, 'ventas');
      alert(`Metas de ${anioOrigen} copiadas a ${anioSeleccionado}`);
      await cargarMetas(anioSeleccionado);
    } catch (err: any) {
      if (err.requiresForce) {
        if (window.confirm(`El año ${anioSeleccionado} ya tiene metas configuradas. ¿Deseas sobrescribirlas por completo con las de ${anioOrigen}? Esta acción no se puede deshacer.`)) {
          try {
            await duplicateMetasMensuales(anioOrigen, anioSeleccionado, true, 'ventas');
            alert('Sobrescritura exitosa.');
            await cargarMetas(anioSeleccionado);
          } catch (forceErr: any) {
            setError(forceErr.message || 'Error al forzar duplicación');
          }
        }
      } else {
        setError(err.message || 'Error al duplicar metas');
      }
    } finally {
      setLoading(false);
    }
  }

  const totalAnual = useMemo(() => {
    let sum = 0;
    for (let i = 1; i <= 12; i++) {
      const v = Number(metas[i]);
      if (!isNaN(v)) sum += v;
    }
    return sum;
  }, [metas]);

  const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-8">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Metas Mensuales (Ventas)</h3>
          <p className="text-sm text-slate-500">Define los objetivos por mes. El KPI de ventas utilizará este valor dependiendo del período consultado.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-600">Año:</label>
          <select 
            value={anioSeleccionado} 
            onChange={e => setAnioSeleccionado(Number(e.target.value))}
            className="border-slate-300 rounded-md text-sm font-semibold focus:ring-probolsas-cyan focus:border-probolsas-cyan"
          >
            {aniosDisponibles.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {isAdmin && (
              <button
                onClick={handleDuplicar}
                className="text-sm text-probolsas-navy font-semibold hover:underline"
              >
                Copiar de {anioSeleccionado - 1}
              </button>
            )}
            
            {!desbloquearHistorico && isAdmin && (
              <button
                onClick={() => setDesbloquearHistorico(true)}
                className="text-sm text-amber-600 font-semibold hover:underline"
              >
                Habilitar edición de meses pasados
              </button>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Total Anual</span>
            <span className="text-xl font-black text-emerald-700">{fmt.format(totalAnual)}</span>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500 animate-pulse">Cargando...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {NOMBRES_MESES.map((nombre, idx) => {
              const mesNum = idx + 1;
              const esHistorico = anioSeleccionado < anioActual || (anioSeleccionado === anioActual && mesNum < mesActual);
              const readOnly = esHistorico && !desbloquearHistorico;

              return (
                <div key={mesNum} className={`border rounded-xl p-4 flex flex-col gap-2 ${readOnly ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">{nombre}</label>
                    {esHistorico && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">CERRADO</span>}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                    <input
                      type="number"
                      value={metas[mesNum] || ''}
                      onChange={e => handleMetaChange(mesNum, e.target.value)}
                      readOnly={readOnly}
                      placeholder="0"
                      className={`w-full pl-7 pr-3 py-2 border rounded-lg text-right font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-probolsas-cyan/30 ${readOnly ? 'bg-slate-100 border-transparent text-slate-500 cursor-not-allowed' : 'border-slate-300 text-slate-800'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleGuardar}
            disabled={guardando || loading}
            className="bg-probolsas-navy text-white px-6 py-2.5 rounded-lg font-bold hover:bg-probolsas-cyan transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
