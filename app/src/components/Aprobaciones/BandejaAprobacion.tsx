import { useState } from 'react';
import type { InformeCierre, EstadoCierre } from '../../types/cierres';
import { ETIQUETA_AREA, ICONO_AREA } from '../../types/cierres';

const COLOR_ESTADO: Record<EstadoCierre, string> = {
  BORRADOR:  'bg-slate-100 text-slate-600',
  ENVIADO:   'bg-blue-100 text-blue-700',
  APROBADO:  'bg-emerald-100 text-emerald-700',
  RECHAZADO: 'bg-red-100 text-red-700',
};

const ETIQUETA_ESTADO: Record<EstadoCierre, string> = {
  BORRADOR:  'Borrador',
  ENVIADO:   'Pendiente',
  APROBADO:  'Aprobado',
  RECHAZADO: 'Rechazado',
};

interface Props {
  informes: InformeCierre[];
  onAprobar: (id: string) => void;
  onRechazar: (id: string, comentario: string) => void;
}

function tarjetaFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ModalRechazo({ onConfirmar, onCancelar }: { onConfirmar: (comentario: string) => void; onCancelar: () => void }) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');

  function handleConfirmar() {
    if (!comentario.trim()) { setError('El motivo de rechazo es obligatorio.'); return; }
    onConfirmar(comentario.trim());
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-xl shrink-0">✕</div>
          <div>
            <h3 className="font-bold text-dashboard-textMain">Rechazar informe</h3>
            <p className="text-sm text-dashboard-textMuted">El líder recibirá una notificación con el motivo.</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-dashboard-textMain mb-1.5">
          Motivo del rechazo <span className="text-red-500">*</span>
        </label>
        <textarea
          value={comentario}
          onChange={e => { setComentario(e.target.value); if (error) setError(''); }}
          placeholder="Explica qué debe corregir el líder antes de reenviar el informe..."
          rows={4}
          className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none text-dashboard-textMain placeholder-slate-400
            ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-probolsas-navy'}`}
          autoFocus
        />
        {error && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><span>⚠</span>{error}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancelar}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-dashboard-textMain bg-white hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}

function TarjetaInforme({
  informe, onAprobar, onRechazar,
}: { informe: InformeCierre; onAprobar: () => void; onRechazar: () => void }) {
  const pendiente = informe.estado === 'ENVIADO';

  return (
    <div className={`bg-white rounded-3xl border shadow-sm p-5 transition-all
      ${pendiente ? 'border-blue-200' : 'border-slate-100'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl shrink-0">
            {ICONO_AREA[informe.area]}
          </div>
          <div>
            <p className="font-semibold text-dashboard-textMain">{ETIQUETA_AREA[informe.area]}</p>
            <p className="text-sm text-dashboard-textMuted">{informe.periodo} · por {informe.responsable}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${COLOR_ESTADO[informe.estado]}`}>
          {ETIQUETA_ESTADO[informe.estado]}
        </span>
      </div>

      <div className="mt-4 text-xs text-dashboard-textMuted flex flex-wrap gap-x-4 gap-y-1">
        <span>Enviado: {tarjetaFechaHora(informe.fechaEnvio)}</span>
        {informe.fechaAprobacion && (
          <span>{informe.estado === 'APROBADO' ? 'Aprobado' : 'Rechazado'}: {tarjetaFechaHora(informe.fechaAprobacion)}</span>
        )}
      </div>

      {/* Comentario de gerencia si existe */}
      {informe.comentarioGerencia && (
        <div className={`mt-3 text-sm px-3 py-2 rounded-xl ${informe.estado === 'RECHAZADO' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
          <span className="font-medium">{informe.estado === 'RECHAZADO' ? 'Motivo del rechazo: ' : 'Comentario gerencia: '}</span>
          {informe.comentarioGerencia}
        </div>
      )}

      {/* Botones de acción — solo para informes ENVIADO */}
      {pendiente && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={onAprobar}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            ✓ Aprobar
          </button>
          <button
            onClick={onRechazar}
            className="flex-1 px-4 py-2.5 rounded-xl border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            ✕ Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

export default function BandejaAprobacion({ informes, onAprobar, onRechazar }: Props) {
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  const pendientes = informes.filter(i => i.estado === 'ENVIADO');
  const resueltos  = informes.filter(i => i.estado !== 'ENVIADO');

  return (
    <div className="max-w-3xl mx-auto">
      {/* Modal de rechazo */}
      {rechazandoId && (
        <ModalRechazo
          onConfirmar={comentario => { onRechazar(rechazandoId, comentario); setRechazandoId(null); }}
          onCancelar={() => setRechazandoId(null)}
        />
      )}

      <header className="mb-6">
        <h2 className="text-2xl font-bold text-dashboard-textMain">Bandeja de aprobación</h2>
        <p className="text-sm text-dashboard-textMuted mt-1">
          Solo el gerente puede aprobar o rechazar los informes de cierre mensual.
        </p>
      </header>

      {/* Sin informes */}
      {informes.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-medium text-dashboard-textMain">No hay informes enviados</p>
          <p className="text-sm text-dashboard-textMuted mt-1">Los informes aparecerán aquí una vez que los líderes los envíen.</p>
        </div>
      )}

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-dashboard-textMain">Pendientes de revisión</h3>
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendientes.length}</span>
          </div>
          <div className="space-y-4">
            {pendientes.map(informe => (
              <TarjetaInforme
                key={informe.id}
                informe={informe}
                onAprobar={() => onAprobar(informe.id)}
                onRechazar={() => setRechazandoId(informe.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Historial */}
      {resueltos.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-dashboard-textMain mb-3">Historial</h3>
          <div className="space-y-3">
            {resueltos.map(informe => (
              <TarjetaInforme
                key={informe.id}
                informe={informe}
                onAprobar={() => onAprobar(informe.id)}
                onRechazar={() => setRechazandoId(informe.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
