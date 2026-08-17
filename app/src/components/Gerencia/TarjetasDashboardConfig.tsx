import { useState, useEffect, useCallback } from 'react';
import { fetchTarjetasDashboard, updateTarjetasDashboard, type TarjetaDashboard } from '../../services/api';
import { useAuth } from '../Auth/AuthContext';

const AREA_ICONS: Record<string, string> = {
  'ventas-meta': '📊', 'margen-caja': '🏦', 'cartera-asesores': '🏠',
  'flujo-caja': '💰', 'cierre-mensual': '📋', 'ordenes-cumplidas': '🏭',
  'costo-produccion': '⚙️', 'calidad-registro': '✅', 'rotacion-personal': '👥',
  'obligaciones-por-vencer': '📅',
};

export default function TarjetasDashboardConfig() {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'admin';

  const [tarjetas, setTarjetas] = useState<TarjetaDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTarjetasDashboard();
      setTarjetas(data);
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message || 'Error al cargar tarjetas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function toggleVisible(index: number) {
    if (!isAdmin) return;
    setTarjetas(prev => prev.map((t, i) => i === index ? { ...t, visible: !t.visible } : t));
    setHasChanges(true);
    setSuccess(false);
  }

  function handleDragStart(index: number) {
    if (!isAdmin) return;
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setTarjetas(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
    setHasChanges(true);
    setSuccess(false);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function moveItem(from: number, to: number) {
    if (to < 0 || to >= tarjetas.length) return;
    setTarjetas(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setHasChanges(true);
    setSuccess(false);
  }

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = tarjetas.map((t, i) => ({ clave: t.clave, visible: t.visible, orden: i + 1 }));
      await updateTarjetasDashboard(payload);
      setSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-8">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-800">Tarjetas del Dashboard</h3>
        </div>
        <div className="p-6 text-center text-slate-400 animate-pulse">Cargando…</div>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-8">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Tarjetas del Dashboard</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Activa o desactiva tarjetas y arrastra para reordenar.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            {success && (
              <span className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                ✓ Guardado
              </span>
            )}
            <button
              onClick={handleGuardar}
              disabled={guardando || !hasChanges}
              className="bg-probolsas-navy text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-probolsas-navy/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {tarjetas.map((t, i) => (
          <div
            key={t.clave}
            draggable={isAdmin}
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            className={`px-6 py-3.5 flex items-center gap-4 transition-all ${
              isAdmin ? 'cursor-grab active:cursor-grabbing' : ''
            } ${dragIndex === i ? 'bg-sky-50 ring-2 ring-probolsas-cyan/30 rounded-lg scale-[1.01]' : 'hover:bg-slate-50'} ${
              !t.visible ? 'opacity-50' : ''
            }`}
          >
            {/* Drag handle + position */}
            <div className="flex items-center gap-2 shrink-0 w-14">
              {isAdmin && (
                <span className="text-slate-300 text-lg select-none" title="Arrastra para reordenar">⠿</span>
              )}
              <span className="text-xs font-bold text-slate-400 bg-slate-100 w-6 h-6 flex items-center justify-center rounded-full">
                {i + 1}
              </span>
            </div>

            {/* Icon + name */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xl shrink-0">{AREA_ICONS[t.clave] || '📌'}</span>
              <span className={`font-semibold truncate ${t.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                {t.nombre}
              </span>
            </div>

            {/* Move buttons (mobile/keyboard fallback) */}
            {isAdmin && (
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => moveItem(i, i - 1)}
                  disabled={i === 0}
                  className="text-slate-400 hover:text-slate-600 text-xs leading-none disabled:opacity-20 disabled:cursor-not-allowed"
                  title="Subir"
                >▲</button>
                <button
                  onClick={() => moveItem(i, i + 1)}
                  disabled={i === tarjetas.length - 1}
                  className="text-slate-400 hover:text-slate-600 text-xs leading-none disabled:opacity-20 disabled:cursor-not-allowed"
                  title="Bajar"
                >▼</button>
              </div>
            )}

            {/* Toggle switch */}
            {isAdmin ? (
              <button
                onClick={() => toggleVisible(i)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  t.visible ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                role="switch"
                aria-checked={t.visible}
                title={t.visible ? 'Visible — clic para ocultar' : 'Oculta — clic para mostrar'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    t.visible ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            ) : (
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                t.visible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {t.visible ? 'Visible' : 'Oculta'}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
