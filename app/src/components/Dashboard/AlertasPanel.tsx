import { useState } from 'react';
import type { KPIReal } from '../../services/api';

interface Alerta {
  id: string;
  nivel: 'rojo' | 'amarillo';
  titulo: string;
  contexto: string;
  responsable: string;
  accion: string;
}

const fmtM = (n: number) => `$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;

function generarAlertas(kpis: Record<string, KPIReal>): Alerta[] {
  const alertas: Alerta[] = [];
  const flujo        = kpis['flujo_caja'];
  const cartera      = kpis['cartera_asesores'];
  const obligaciones = kpis['obligaciones_por_vencer'];
  const margen       = kpis['margen_caja'];
  const cierre       = kpis['cierre_mensual'];

  // ── 1. Días de caja disponibles ────────────────────────────────────────────
  if (flujo?.diasCajaDisponibles != null && !flujo.sinDatos) {
    const dias = flujo.diasCajaDisponibles;
    if (dias < 7) {
      const diasLabel = dias < 1 ? 'menos de 1 día' : `${dias.toFixed(1)} días`;
      alertas.push({
        id: 'caja-critica',
        nivel: dias < 3 ? 'rojo' : 'amarillo',
        titulo: `Caja operativa: ${diasLabel} cubiertos con el flujo actual`,
        contexto: `El flujo neto del período (${flujo.valorFormateado ?? '—'}) cubre menos de una semana de egresos operativos (${fmtM(flujo.egresosRaw ?? 0)}/mes). Se requieren cobros urgentes o financiación.`,
        responsable: 'Gerencia + Finanzas',
        accion: 'Activar cobro urgente',
      });
    }
  }

  // ── 2. Brecha cobro vs pago: cartera vencida vs obligaciones próximas ─────
  if (
    cartera?.vencidoRaw != null &&
    obligaciones?.totalVencidoRaw != null
  ) {
    const cobrosEsperados = (cartera.vencidoRaw ?? 0);
    const pagosRequeridos = (obligaciones.totalVencidoRaw ?? 0)
                          + (obligaciones.d15Raw ?? 0)
                          + (obligaciones.d30Raw ?? 0);
    const brecha = cobrosEsperados - pagosRequeridos;
    if (brecha < 0) {
      alertas.push({
        id: 'brecha-30d',
        nivel: 'rojo',
        titulo: `Brecha financiera: cartera vencida (${fmtM(cobrosEsperados)}) no cubre pagos próximos (${fmtM(pagosRequeridos)})`,
        contexto: `La cartera vencida por cobrar a clientes no alcanza para cubrir las obligaciones vencidas y próximas a 30 días con proveedores. La cadena cobro→pago está desbalanceada.`,
        responsable: 'Gerencia + Finanzas + Cartera',
        accion: 'Plan de caja urgente',
      });
    }
  }

  // ── 3. Obligaciones vencidas con proveedores ───────────────────────────────
  if (obligaciones?.totalVencidoRaw != null && obligaciones.totalVencidoRaw > 0) {
    alertas.push({
      id: 'obligaciones-vencidas',
      nivel: obligaciones.totalVencidoRaw > 10_000_000 ? 'rojo' : 'amarillo',
      titulo: `Obligaciones vencidas: ${fmtM(obligaciones.totalVencidoRaw)} sin pagar`,
      contexto: 'Mora activa con proveedores. Puede comprometer el suministro de materias primas y el crédito comercial futuro.',
      responsable: 'Finanzas',
      accion: 'Priorizar pagos urgentes',
    });
  }

  // ── 4. Cartera vencida de clientes alta ────────────────────────────────────
  if (cartera?.vencidoRaw != null && cartera.vencidoRaw > 50_000_000) {
    const pctVencido = cartera.valor ? (cartera.vencidoRaw / cartera.valor * 100) : 0;
    alertas.push({
      id: 'cartera-vencida-alta',
      nivel: pctVencido > 40 ? 'rojo' : 'amarillo',
      titulo: `Cartera vencida clientes: ${fmtM(cartera.vencidoRaw)} (${pctVencido.toFixed(1)}% del total)`,
      contexto: 'Cartera de clientes con mora activa. Un alto porcentaje vencido compromete el flujo de caja y puede requerir gestión de cobro urgente.',
      responsable: 'Cartera',
      accion: 'Activar gestión de cobro con asesores',
    });
  }

  // ── 5. Margen de caja ─────────────────────────────────────────────────────
  if (margen?.valor != null && margen.fuente === 'real' && !margen.sinDatos) {
    if (margen.valor < 25) {
      alertas.push({
        id: 'margen-critico',
        nivel: 'rojo',
        titulo: `Margen de caja crítico: ${margen.valor}% — bajo el umbral de viabilidad (≥35%)`,
        contexto: 'Los egresos consumen más del 75% de las ventas. La operación no genera caja suficiente para cubrir costos fijos e inversión.',
        responsable: 'Gerencia + Finanzas',
        accion: 'Revisar egresos y reducir costos operativos',
      });
    } else if (margen.valor < 35) {
      alertas.push({
        id: 'margen-bajo',
        nivel: 'amarillo',
        titulo: `Margen de caja en precaución: ${margen.valor}% (meta ≥ 35%)`,
        contexto: 'El margen de caja está por debajo de la meta. Cada punto que baja representa menos disponibilidad operativa al cierre del mes.',
        responsable: 'Gerencia + Finanzas',
        accion: 'Revisar egresos del período',
      });
    }
  }

  // ── 6. Cierre mensual incompleto ───────────────────────────────────────────
  if (cierre?.valor != null && cierre.valor < 100 && cierre.fuente === 'real') {
    alertas.push({
      id: 'cierre-incompleto',
      nivel: cierre.valor < 60 ? 'rojo' : 'amarillo',
      titulo: `Cierre mensual incompleto: ${cierre.meta ?? `${cierre.valor}%`}`,
      contexto: 'Sin todos los cierres, los KPIs financieros y operativos son parciales. Las decisiones se basan en información incompleta.',
      responsable: 'Gerencia',
      accion: 'Solicitar cierres pendientes',
    });
  }

  // Rojos primero, luego amarillos
  return alertas.sort((a, b) => {
    if (a.nivel === b.nivel) return 0;
    return a.nivel === 'rojo' ? -1 : 1;
  });
}

export default function AlertasPanel({ kpis }: { kpis: Record<string, KPIReal> }) {
  const [expandido, setExpandido] = useState(true);
  const alertas   = generarAlertas(kpis);

  if (alertas.length === 0) {
    return (
      <div className="flex items-center gap-2 mb-6 px-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span className="text-xs font-medium text-emerald-700">Todos los indicadores dentro de rango normal</span>
      </div>
    );
  }

  const rojas     = alertas.filter(a => a.nivel === 'rojo').length;
  const amarillas = alertas.filter(a => a.nivel === 'amarillo').length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">

      {/* Header / toggle */}
      <button
        onClick={() => setExpandido(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-dashboard-textMain">⚡ Alertas activas</span>
          <div className="flex items-center gap-2">
            {rojas > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                {rojas} crítica{rojas !== 1 ? 's' : ''}
              </span>
            )}
            {amarillas > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                {amarillas} en precaución
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-dashboard-textMuted shrink-0 ml-4">{expandido ? '▲ Ocultar' : '▼ Ver alertas'}</span>
      </button>

      {/* Lista de alertas */}
      {expandido && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {alertas.map(alerta => (
            <div key={alerta.id} className="flex items-start gap-3 px-5 py-4">
              <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${alerta.nivel === 'rojo' ? 'bg-red-500' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-snug ${alerta.nivel === 'rojo' ? 'text-red-700' : 'text-amber-700'}`}>
                  {alerta.titulo}
                </p>
                <p className="text-xs text-dashboard-textMuted mt-1 leading-relaxed">
                  {alerta.contexto}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <span className="text-xs text-slate-400">Responsable: <span className="font-medium text-slate-500">{alerta.responsable}</span></span>
                  <span className="text-xs font-semibold text-probolsas-navy">→ {alerta.accion}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
