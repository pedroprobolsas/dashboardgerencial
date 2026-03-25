import type { KPI, AlertaColor } from '../../data/kpis';

const coloresAlerta: Record<AlertaColor, { fondo: string; punto: string; texto: string; borde: string }> = {
  verde:    { fondo: 'bg-emerald-50',  punto: 'bg-emerald-500', texto: 'text-emerald-700',  borde: 'border-emerald-200' },
  amarillo: { fondo: 'bg-amber-50',    punto: 'bg-amber-400',   texto: 'text-amber-700',    borde: 'border-amber-200' },
  rojo:     { fondo: 'bg-red-50',      punto: 'bg-red-500',     texto: 'text-red-700',      borde: 'border-red-200' },
};

const iconosArea: Record<string, string> = {
  'Ventas':         '📈',
  'Finanzas':       '💰',
  'Cartera':        '🏦',
  'Proveedores':    '🏭',
  'Producción':     '⚙️',
  'Todas las áreas': '📋',
  'Talento Humano': '👥',
};

export default function KPICard({ kpi }: { kpi: KPI }) {
  const colores = coloresAlerta[kpi.alerta];

  return (
    <div className={`bg-white rounded-3xl shadow-sm border ${colores.borde} p-5 flex flex-col gap-3 transition-shadow hover:shadow-md`}>
      {/* Cabecera: área + indicador de color */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-dashboard-textMuted uppercase tracking-wide flex items-center gap-1">
          <span>{iconosArea[kpi.area] ?? '📊'}</span>
          <span>{kpi.area}</span>
        </span>
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${colores.fondo} ${colores.texto}`}>
          <span className={`w-2 h-2 rounded-full ${colores.punto}`}></span>
          {kpi.descripcionAlerta}
        </span>
      </div>

      {/* Nombre del KPI */}
      <p className="text-sm font-medium text-dashboard-textMain leading-snug">{kpi.nombre}</p>

      {/* Valor principal */}
      <p className="text-2xl font-bold text-dashboard-textMain leading-none">{kpi.valorFormateado}</p>

      {/* Subtítulo contextual (ej: ahorro de presupuesto) */}
      {kpi.subtitulo && (
        <p className="text-xs font-medium text-emerald-600">{kpi.subtitulo}</p>
      )}

      {/* Meta / umbral */}
      {kpi.meta && (
        <p className="text-xs text-dashboard-textMuted">{kpi.meta}</p>
      )}

      {/* Grid de 2 columnas para KPIs con desglose (ej: Producción) */}
      {kpi.filas && kpi.filas.length > 0 && (
        <div className="border-t border-slate-100 pt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {kpi.filas.map((fila, i) => (
            <div key={i} className="contents">
              <div>
                <p className="text-[10px] text-dashboard-textMuted uppercase tracking-wide">{fila.izq.label}</p>
                <p className="text-xs font-semibold text-dashboard-textMain">{fila.izq.valor}</p>
              </div>
              <div>
                <p className="text-[10px] text-dashboard-textMuted uppercase tracking-wide">{fila.der.label}</p>
                <p className="text-xs font-semibold text-dashboard-textMain">{fila.der.valor}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Subtexto: desglose de ingresos/egresos, aging de cartera u órdenes/margen */}
      {kpi.subtexto && (
        <div className="border-t border-slate-100 pt-2 flex flex-col gap-1">
          {kpi.subtexto.split(' | ').map((linea, i) => (
            <span key={i} className="text-xs text-dashboard-textMuted">{linea}</span>
          ))}
        </div>
      )}
    </div>
  );
}
