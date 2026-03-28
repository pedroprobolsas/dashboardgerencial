import { type KPIDiario } from '../../services/api';
import { type AlertaColor } from '../../data/kpis';

interface Props {
  data: KPIDiario;
}

const coloresAlerta: Record<AlertaColor, { fondo: string; punto: string; texto: string; borde: string }> = {
  verde:    { fondo: 'bg-emerald-50',  punto: 'bg-emerald-500', texto: 'text-emerald-700',  borde: 'border-emerald-200' },
  amarillo: { fondo: 'bg-amber-50',    punto: 'bg-amber-400',   texto: 'text-amber-700',    borde: 'border-amber-200' },
  rojo:     { fondo: 'bg-red-50',      punto: 'bg-red-500',     texto: 'text-red-700',      borde: 'border-red-200' },
};

export default function VistazoDiario({ data }: Props) {
  const { hoy, mes } = data;

  return (
    <div className="space-y-12">
      {/* SECCIÓN HOY */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-probolsas-navy/10 flex items-center justify-center text-xl shadow-inner text-probolsas-navy">
            📅
          </div>
          <div>
            <h3 className="text-2xl font-bold text-dashboard-textMain">Cierre de Hoy</h3>
            <p className="text-sm text-dashboard-textMuted lowercase first-letter:uppercase">Resumen operativo del día en tiempo real</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <DailyCard
            label="Total Vendido Hoy"
            valor={hoy.ventas.valor}
            alerta={hoy.ventas.alerta}
            icono="📈"
            area="Ventas"
          />
          <DailyCard
            label="Total Egresos Hoy"
            valor={hoy.egresos.valor}
            alerta={hoy.egresos.alerta}
            icono="💸"
            area="Finanzas"
          />
          <DailyCard
            label="Total Cobrado Hoy"
            valor={hoy.cobros.valor}
            alerta={hoy.cobros.alerta}
            icono="💰"
            area="Cartera"
          />
          <DailyCard
            label="Saldo Neto del Día"
            valor={hoy.saldo_neto.valor}
            alerta={hoy.saldo_neto.alerta}
            subtexto="Cobrado menos Egresos"
            icono="⚖️"
            area="Finanzas"
          />
        </div>
      </section>

      {/* SECCIÓN MES AL DÍA */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-probolsas-cyan/10 flex items-center justify-center text-xl shadow-inner text-probolsas-navy">
            📊
          </div>
          <div>
            <h3 className="text-2xl font-bold text-dashboard-textMain">Acumulado Mes al Día</h3>
            <p className="text-sm text-dashboard-textMuted lowercase first-letter:uppercase">Desde el día 1 hasta el cierre de ayer</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <DailyCard
            label="Ventas Acumuladas"
            valor={mes.ventas.valor}
            alerta={mes.ventas.alerta}
            meta={`Meta del mes: ${mes.meta_ventas}`}
            subtexto={`${mes.pct_ventas} de la meta cumplido`}
            icono="🎯"
            area="Ventas"
          />
          <DailyCard
            label="Egresos Mes"
            valor={mes.egresos.valor}
            alerta={mes.egresos.alerta}
            icono="📉"
            area="Finanzas"
          />
          <DailyCard
            label="Cobros Mes"
            valor={mes.cobros.valor}
            alerta={mes.cobros.alerta}
            icono="📥"
            area="Cartera"
          />
          <DailyCard
            label="Flujo Neto Mes"
            valor={mes.flujo_neto.valor}
            alerta={mes.flujo_neto.alerta}
            subtexto="Saldo disponible del mes"
            icono="🏦"
            area="Finanzas"
          />
        </div>
      </section>
    </div>
  );
}

interface CardProps {
  label: string;
  valor: string;
  alerta: AlertaColor;
  area: string;
  meta?: string;
  subtexto?: string;
  icono: string;
}

function DailyCard({ label, valor, alerta, area, meta, subtexto, icono }: CardProps) {
  const colores = coloresAlerta[alerta];

  return (
    <div className={`bg-white rounded-3xl shadow-sm border ${colores.borde} p-6 flex flex-col gap-3 transition-all hover:shadow-md`}>
      {/* Cabecera idéntica a KPICard */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-dashboard-textMuted uppercase tracking-widest flex items-center gap-1.5">
          <span className="text-sm">{icono}</span>
          <span>{area}</span>
        </span>
        <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${colores.fondo} ${colores.texto} uppercase tracking-tight`}>
          <span className={`w-1.5 h-1.5 rounded-full ${colores.punto}`}></span>
          {alerta === 'verde' ? 'Normal' : alerta === 'amarillo' ? 'Precaución' : 'Crítico'}
        </span>
      </div>

      <p className="text-xs font-semibold text-dashboard-textMuted uppercase tracking-wide -mb-1">
        {label}
      </p>

      <p className="text-2xl font-black text-dashboard-textMain tracking-tight leading-none break-words">
        {valor}
      </p>

      {meta && (
        <p className="text-[11px] font-medium text-dashboard-textMuted mt-1 leading-tight">
          {meta}
        </p>
      )}

      {subtexto && (
        <p className={`text-[11px] font-bold mt-0.5 leading-tight ${colores.texto}`}>
          {subtexto}
        </p>
      )}
    </div>
  );
}
