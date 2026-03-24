import type { DatoPrellenado } from '../../services/api';
// Componentes y utilidades compartidos por todos los formularios de cierre

// ── Período ───────────────────────────────────────────────────────────────────

export function generarPeriodos(): { valor: string; etiqueta: string }[] {
  const lista = [];
  const ahora = new Date();
  for (let i = 0; i < 6; i++) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const valor = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const crudo = fecha.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    lista.push({ valor, etiqueta: crudo.charAt(0).toUpperCase() + crudo.slice(1) });
  }
  return lista;
}

// ── Primitivos UI ─────────────────────────────────────────────────────────────

export function Label({ children, requerido }: { children: React.ReactNode; requerido?: boolean }) {
  return (
    <label className="block text-sm font-medium text-dashboard-textMain mb-1.5">
      {children}
      {requerido && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

export function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><span>⚠</span>{msg}</p>;
}

export function Input({
  type = 'text', value, onChange, placeholder, error, prefix, suffix,
}: {
  type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; prefix?: string; suffix?: string;
}) {
  return (
    <div className={`flex items-center border rounded-xl overflow-hidden transition-colors
      ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white focus-within:border-probolsas-navy'}`}>
      {prefix && <span className="px-3 text-sm text-dashboard-textMuted bg-slate-50 border-r border-slate-200 py-2.5 shrink-0">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent text-dashboard-textMain placeholder-slate-400"
      />
      {suffix && <span className="px-3 text-sm text-dashboard-textMuted bg-slate-50 border-l border-slate-200 py-2.5 shrink-0">{suffix}</span>}
    </div>
  );
}

export function Textarea({
  value, onChange, placeholder, error, rows = 4, minChars,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; rows?: number; minChars?: number;
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none transition-colors text-dashboard-textMain placeholder-slate-400
          ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white focus:border-probolsas-navy'}`}
      />
      {minChars !== undefined && (
        <div className="flex justify-end mt-1">
          <span className={`text-xs ${value.length < minChars ? 'text-amber-600' : 'text-emerald-600'}`}>
            {value.length} / {minChars} caracteres mínimos
          </span>
        </div>
      )}
    </div>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-base font-semibold text-dashboard-textMain mb-5 pb-3 border-b border-slate-100">{titulo}</h3>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function PeriodoSelector({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error?: string }) {
  const periodos = generarPeriodos();
  return (
    <div>
      <Label requerido>Período</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none bg-white transition-colors text-dashboard-textMain
          ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-probolsas-navy'}`}
      >
        {periodos.map(p => (
          <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
        ))}
      </select>
      <ErrorMsg msg={error} />
    </div>
  );
}

export function BotonesFormulario({
  onGuardar, onEnviar,
}: { onGuardar: () => void; onEnviar: () => void }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-8">
      <button
        type="button"
        onClick={onGuardar}
        className="flex-1 sm:flex-none px-6 py-3 rounded-xl border border-slate-300 text-sm font-medium text-dashboard-textMain bg-white hover:bg-slate-50 transition-colors"
      >
        Guardar borrador
      </button>
      <button
        type="button"
        onClick={onEnviar}
        className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-probolsas-navy text-white text-sm font-medium hover:bg-blue-800 transition-colors shadow-sm"
      >
        Enviar a gerencia →
      </button>
    </div>
  );
}

export function PantallaExito({
  area, periodo, onNuevo,
}: { area: string; periodo: string; onNuevo: () => void }) {
  return (
    <div className="max-w-2xl mx-auto mt-16 text-center">
      <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm p-10">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h2 className="text-2xl font-bold text-dashboard-textMain mb-2">Informe enviado</h2>
        <p className="text-dashboard-textMuted mb-1">
          El cierre de <strong>{area}</strong> del período <strong>{periodo}</strong> fue enviado correctamente.
        </p>
        <p className="text-sm text-dashboard-textMuted mb-6">La gerencia recibirá una notificación para su aprobación.</p>
        <button
          onClick={onNuevo}
          className="bg-probolsas-navy text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          Nuevo informe
        </button>
      </div>
    </div>
  );
}

export function CabeceraFormulario({
  area, descripcion,
}: { area: string; descripcion?: string }) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2 text-sm text-dashboard-textMuted mb-1">
        <span>Cierre Mensual</span>
        <span>›</span>
        <span className="text-dashboard-textMain font-medium">{area}</span>
      </div>
      <h2 className="text-2xl font-bold text-dashboard-textMain">Informe de cierre — {area}</h2>
      {descripcion && <p className="text-sm text-dashboard-textMuted mt-1">{descripcion}</p>}
      <p className="text-sm text-dashboard-textMuted mt-1">
        Completa todos los campos marcados con <span className="text-red-500">*</span> antes de enviar.
      </p>
    </header>
  );
}

// ── Validadores comunes ───────────────────────────────────────────────────────

export function validarNumero(val: string, label: string, opciones?: { entero?: boolean; min?: number; max?: number }): string | undefined {
  if (val === '') return `${label} es obligatorio.`;
  const n = Number(val);
  if (isNaN(n)) return `${label} debe ser un número.`;
  if (opciones?.entero && !Number.isInteger(n)) return `${label} debe ser un número entero.`;
  if (opciones?.min !== undefined && n < opciones.min) return `${label} debe ser ≥ ${opciones.min}.`;
  if (opciones?.max !== undefined && n > opciones.max) return `${label} debe ser ≤ ${opciones.max}.`;
  return undefined;
}

export function validarURL(val: string): string | undefined {
  if (!val) return undefined;
  try { new URL(val); return undefined; }
  catch { return 'Ingresa una URL válida (debe comenzar con https://).'; }
}

// ── Campo con pre-llenado del sistema ─────────────────────────────────────────

export type { DatoPrellenado };

export function calcDiffPct(sistema: number, editadoStr: string): number | null {
  if (editadoStr === '' || editadoStr === String(sistema)) return null;
  const n = parseFloat(editadoStr);
  if (isNaN(n) || sistema === 0) return null;
  const d = Math.abs((n - sistema) / sistema) * 100;
  return d < 0.01 ? null : d;
}

type NivelDiff = 'neutro' | 'verde' | 'amarillo' | 'rojo';

function nivelDiff(diff: number | null): NivelDiff {
  if (diff === null) return 'neutro';
  if (diff <= 5)     return 'verde';
  if (diff <= 10)    return 'amarillo';
  return 'rojo';
}

const BORDE_CLASE: Record<NivelDiff, string> = {
  neutro:   'border-slate-200 bg-white focus-within:border-probolsas-navy',
  verde:    'border-emerald-400 focus-within:border-emerald-500',
  amarillo: 'border-amber-400 focus-within:border-amber-500',
  rojo:     'border-red-400 focus-within:border-red-500',
};

export function InputConPrellenado({
  type = 'text', value, onChange, placeholder, error, prefix, suffix, prellenado,
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  prellenado?: DatoPrellenado;
}) {
  const diff  = prellenado ? calcDiffPct(prellenado.valor, value) : null;
  const nivel = error ? 'neutro' : nivelDiff(diff); // error overrides diff color

  const bordeFinal = error
    ? 'border-red-400 bg-red-50'
    : BORDE_CLASE[nivel];

  return (
    <div>
      <div className={`flex items-center border rounded-xl overflow-hidden transition-colors ${bordeFinal}`}>
        {prefix && (
          <span className="px-3 text-sm text-dashboard-textMuted bg-slate-50 border-r border-slate-200 py-2.5 shrink-0">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={prellenado ? String(prellenado.valor) : placeholder}
          className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent text-dashboard-textMain placeholder-slate-400"
        />
        {suffix && (
          <span className="px-3 text-sm text-dashboard-textMuted bg-slate-50 border-l border-slate-200 py-2.5 shrink-0">
            {suffix}
          </span>
        )}
        {prellenado && (
          <span className="px-2.5 py-2.5 text-xs bg-blue-50 text-blue-600 border-l border-blue-100 shrink-0 font-medium whitespace-nowrap">
            Dato del sistema
          </span>
        )}
      </div>

      {prellenado && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
          <span className="text-slate-400">
            Sistema: <span className="font-medium text-blue-600">{prellenado.etiqueta}</span>
          </span>
          {diff !== null && (
            <span className={
              nivel === 'verde'    ? 'text-emerald-600'
              : nivel === 'amarillo' ? 'text-amber-700 font-medium'
              : 'text-red-600 font-medium'
            }>
              {nivel === 'amarillo' ? '⚠ ' : nivel === 'rojo' ? '✕ ' : ''}
              {diff.toFixed(1)}% diferencia
              {nivel === 'amarillo' ? ' — comentario recomendado'
                : nivel === 'rojo' ? ' — justificación obligatoria' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
