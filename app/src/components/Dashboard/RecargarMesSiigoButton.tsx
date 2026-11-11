import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../Auth/AuthContext';
import { recargarMesSaldosSiigo, type RecargarMesSiigoResultado } from '../../services/api';

const ORDEN_CLASES = ['1', '2', '4', '5', '6'] as const;

function formatearResumenClases(resumen: RecargarMesSiigoResultado): string {
  const desglose = ORDEN_CLASES
    .map((c) => `C${c}: ${resumen.cuentas_por_clase[c] ?? 0}`)
    .join(' · ');
  return `${resumen.total_cuentas} ctas (${desglose})`;
}

interface RecargarMesSiigoButtonProps {
  periodo: string;
  onRecargaExitosa: () => void;
}

export default function RecargarMesSiigoButton({ periodo, onRecargaExitosa }: RecargarMesSiigoButtonProps) {
  const { user } = useAuth();
  const [recargando, setRecargando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMensajeExito(null);
    setError(null);
  }, [periodo]);

  if (user?.rol !== 'admin') {
    return null;
  }

  const handleRecargar = async () => {
    setRecargando(true);
    setMensajeExito(null);
    setError(null);
    try {
      const [anio, mes] = periodo.split('-').map(Number);
      const resultado = await recargarMesSaldosSiigo(anio, mes);
      setMensajeExito(formatearResumenClases(resultado));
      onRecargaExitosa();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al recargar mes desde SIIGO';
      setError(msg);
    } finally {
      setRecargando(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleRecargar}
        disabled={recargando}
        className="flex items-center gap-1.5 text-sm bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-dashboard-textMain hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} className={recargando ? 'animate-spin text-probolsas-cyan' : ''} />
        {recargando ? 'Recargando…' : 'Recargar mes desde SIIGO'}
      </button>
      {mensajeExito && (
        <span className="text-[11px] text-emerald-600 font-medium mt-1" title={mensajeExito}>
          {mensajeExito}
        </span>
      )}
      {error && (
        <span className="text-[11px] text-red-500 mt-1 max-w-[320px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
