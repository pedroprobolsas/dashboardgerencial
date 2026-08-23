import { useState, useEffect } from 'react';
import Layout from './components/Layout/Layout';
import { type Vista } from './components/Layout/Sidebar';
import KPICard, { KPICardSkeleton, KPICardError } from './components/Dashboard/KPICard';
import AlertasPanel from './components/Dashboard/AlertasPanel';
import CierreVentasForm from './components/Forms/CierreVentasForm';
import CierreFinanzasForm from './components/Forms/CierreFinanzasForm';
import CierreProduccionForm from './components/Forms/CierreProduccionForm';
import CierreCarteraForm from './components/Forms/CierreCarteraForm';
import CierreTalentoHumanoForm from './components/Forms/CierreTalentoHumanoForm';
import BandejaAprobacion from './components/Aprobaciones/BandejaAprobacion';
import CostoProduccionDetalle from './components/Produccion/CostoProduccionDetalle';
import AnalisisResponsables from './components/Produccion/AnalisisResponsables';
import AnalisisMateriales from './components/Produccion/AnalisisMateriales';
import MovimientoMateriales from './components/Inventario/MovimientoMateriales';
import ConfiguracionMetas from './components/Gerencia/ConfiguracionMetas';
import Usuarios from './components/Gerencia/Usuarios';
import Login from './components/Auth/Login';
import { AuthContext } from './components/Auth/AuthContext';
import { type KPI, type AlertaColor, type FilaGrid } from './data/kpis';
import { fetchKPIs, fetchVentasMes, fetchCarteraAsesor, fetchMargenGlobal, enviarCierre, actualizarEstadoCierre, fetchBandeja, fetchMe, logout as apiLogout, fetchTarjetasDashboard, periodoToRango, type KPIReal, type KPIDiario, type Usuario, type TarjetaDashboard } from './services/api';
import VistazoDiario from './components/Dashboard/VistazoDiario';
import type { InformeCierre, AreaCierre } from './types/cierres';
import InformePDFModal from './components/Produccion/InformePDFModal';
import OpTrazabilidadModal from './components/Produccion/OpTrazabilidadModal';

// ── Adaptador: KPIReal (backend) → KPI (componente tarjeta) ──────────────────

function adaptarKPI(raw: KPIReal): KPI {
  const alerta: AlertaColor = raw.sinDatos ? 'gris' : ((raw.alerta as AlertaColor) ?? 'amarillo');

  const descEstado = raw.fuente === 'real'
    ? (raw.sinDatos ? 'Sin datos' : alerta === 'verde' ? 'Normal' : alerta === 'amarillo' ? 'Precaución' : 'Alerta')
    : raw.fuente === 'error' ? 'Error de lectura'
    : 'Pendiente de datos';

  const base: KPI = {
    id: raw.id,
    nombre: raw.nombre,
    area: raw.area,
    valor: raw.valor ?? 0,
    valorFormateado: raw.valorFormateado ?? '—',
    meta: raw.meta ?? raw.nota,
    alerta,
    descripcionAlerta: descEstado,
    fechaActualizacion: raw.fechaActualizacion,
    desactualizado: raw.desactualizado,
    detalle: raw.detalle,
  };

  // ── Ventas: valor bruto como principal + desglose IVA/neto ──────────────
  if (raw.id === 'ventas-meta' && raw.valorBruto) {
    const partes = [
      raw.valorIva      ? `IVA: ${raw.valorIva}`       : null,
      raw.valorNetoTotal ? `Con IVA: ${raw.valorNetoTotal}` : null,
    ].filter(Boolean).join(' | ');
    return {
      ...base,
      valorFormateado: raw.valorBruto,
      meta: `${raw.meta ?? ''} — ${raw.valorFormateado} cumplido`.trim(),
      subtexto: partes || undefined,
    };
  }

  // ── Margen de caja: % como principal + monto absoluto y desglose ────────
  if (raw.id === 'margen-caja' && raw.valorAbsoluto) {
    const descMargen = raw.sinDatos ? 'Sin datos' : alerta === 'verde' ? 'Margen saludable' : alerta === 'amarillo' ? 'Margen ajustado' : 'Margen crítico';
    const filas: FilaGrid[] = [];
    if (raw.desgloseEgresos) {
      const d = raw.desgloseEgresos;
      filas.push(
        { izq: { label: 'MATERIA PRIMA', valor: d.materiaPrima }, der: { label: 'GASTOS', valor: d.gastos } },
        { izq: { label: 'OBLIG. FINANCIERAS', valor: d.obligaciones }, der: { label: 'TOTAL EGRESOS', valor: d.total } },
      );
    }
    return {
      ...base,
      descripcionAlerta: descMargen,
      subtexto: raw.detalle || undefined,
      filas: filas.length > 0 ? filas : undefined,
    };
  }

  // ── Flujo de caja ──────────────────────────────────────────────────────────
  if (raw.id === 'flujo-caja') {
    const descFlujo = raw.sinDatos ? 'Sin datos' : alerta === 'verde' ? 'Flujo positivo' : alerta === 'amarillo' ? 'Flujo al límite' : 'Flujo negativo';
    return {
      ...base,
      descripcionAlerta: descFlujo,
      subtexto: raw.detalle || undefined,
      cuentasDesglose: raw.cuentasDesglose,
    };
  }

  // ── CxC por Asesor: total + top asesores en filas ───────────────────────
  if (raw.id === 'cartera-asesores' && raw.fuente === 'real') {
    const asesores = raw.topAsesores ?? [];
    const filas: FilaGrid[] = [];
    for (let i = 0; i < asesores.length; i += 2) {
      filas.push({
        izq: { label: asesores[i].nombre,        valor: asesores[i].saldo },
        der: asesores[i + 1]
          ? { label: asesores[i + 1].nombre, valor: asesores[i + 1].saldo }
          : { label: '', valor: '' },
      });
    }
    return {
      ...base,
      subtexto: raw.detalle || undefined,
      filas: filas.length > 0 ? filas : undefined,
    };
  }

  // ── Órdenes Cumplidas: cumplimiento % + críticas + días atraso ─────────────
  if (raw.id === 'ordenes-cumplidas' && raw.fuente === 'real') {
    const descProd = raw.sinDatos ? 'Sin datos' : alerta === 'verde' ? 'En meta' : alerta === 'amarillo' ? 'Con desviaciones' : 'Crítico';

    const filas: FilaGrid[] = [];
    if (raw.opsCriticas != null && raw.opsAtrasadas != null) {
      filas.push({
        izq: { label: 'OPs críticas (>5%)', valor: `${raw.opsCriticas}` },
        der: { label: 'OPs atrasadas',       valor: `${raw.opsAtrasadas}` },
      });
    }

    const subtexto = [
      raw.ordenes         != null ? `Total: ${raw.ordenes} OPs`                     : null,
      raw.totalDiasAtraso != null ? `Días atraso acum.: ${raw.totalDiasAtraso}`     : null,
    ].filter(Boolean).join(' | ');

    return { ...base, descripcionAlerta: descProd, filas: filas.length > 0 ? filas : undefined, subtexto: subtexto || undefined };
  }

  // ── Costo de Producción: margen promedio + desglose facturado/costo ─────────
  if (raw.id === 'costo-produccion' && raw.fuente === 'real') {
    const descCosto = raw.sinDatos ? 'Sin datos' : alerta === 'verde' ? 'Margen positivo' : alerta === 'amarillo' ? 'Alerta amarilla' : 'Margen bajo';
    const filas: FilaGrid[] = [];
    if (raw.valorProducido && raw.costoEjecutado) {
      filas.push({
        izq: { label: 'Valor Producción Cumplida', valor: raw.valorProducido },
        der: { label: 'Costo',     valor: raw.costoEjecutado },
      });
      filas.push({
        izq: { label: 'Rentabilidad Promedio', valor: `${raw.margenProm}%` },
        der: { label: '', valor: '' },
      });
    }

    let titular = base.valorFormateado;
    if (raw.opsPerdidaReal != null) {
      titular = `${base.valorFormateado} perdidos en ${raw.opsPerdidaReal} OPs`;
    }

    const subtexto = [
      raw.opsBajoMeta != null ? `${raw.opsBajoMeta} OPs bajo la meta de rentabilidad` : null,
    ].filter(Boolean).join(' | ');

    return { 
      ...base, 
      valorFormateado: titular,
      descripcionAlerta: descCosto, 
      filas: filas.length > 0 ? filas : undefined, 
      subtexto: subtexto || undefined 
    };
  }

  // ── Obligaciones por vencer: total + desglose por rango de días ─────────────
  if (raw.id === 'obligaciones-por-vencer' && raw.fuente === 'real') {
    const descOblig = raw.sinDatos ? 'Sin datos' : raw.alerta === 'verde' ? 'Al día' : raw.alerta === 'amarillo' ? 'Con vencidos' : 'Vencidos urgentes';
    const dv = raw.desgloseVencimientos;

    const filas: FilaGrid[] = [];
    if (raw.totalVencidoPorPagar && raw.totalPorVencer) {
      filas.push({
        izq: { label: 'Vencidas', valor: raw.totalVencidoPorPagar },
        der: { label: 'Por vencer', valor: raw.totalPorVencer },
      });
    }

    const subtexto = dv
      ? [
          dv.vencido && dv.vencido !== '$ 0' ? `Vencidas: ${dv.vencido}` : null,
          dv.d15     && dv.d15 !== '$ 0'     ? `≤15 días: ${dv.d15}` : null,
          dv.d30     && dv.d30 !== '$ 0'     ? `16-30 días: ${dv.d30}` : null,
          dv.d60     && dv.d60 !== '$ 0'     ? `31-60 días: ${dv.d60}` : null,
          dv.d60plus && dv.d60plus !== '$ 0' ? `+60 días: ${dv.d60plus}` : null,
        ].filter(Boolean).join(' | ')
      : undefined;

    return { ...base, descripcionAlerta: descOblig, filas: filas.length > 0 ? filas : undefined, subtexto: subtexto || undefined };
  }

  // ── Talento Humano: rotación + desglose empleados/retiros/ausentismo ────────
  if (raw.id === 'rotacion-personal' && raw.fuente === 'real') {
    const descRot = raw.sinDatos ? 'Sin datos' : alerta === 'verde' ? 'Normal' : alerta === 'amarillo' ? 'Moderada' : 'Alta';
    const lineas = [
      raw.totalEmpleados != null ? `Empleados: ${raw.totalEmpleados}`         : null,
      raw.retiros        != null ? `Retiros: ${raw.retiros}`                  : null,
      raw.diasAusentismo         ? `Ausentismo: ${raw.diasAusentismo} días`   : null,
      raw.incidentesSeguridad    ? `Incidentes: ${raw.incidentesSeguridad}`   : null,
    ].filter(Boolean).join(' | ');
    return { ...base, descripcionAlerta: descRot, subtexto: lineas || undefined };
  }

  return base;
}

// ── Helpers para el selector de período ──────────────────────────────────────

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodoLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

/** Genera los últimos 12 períodos incluyendo el actual */
function generarPeriodos(): string[] {
  const periodos: string[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    periodos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return periodos;
}

// ── Vista Dashboard ───────────────────────────────────────────────────────────

// IDs de KPIs que siguen usando el endpoint monolítico /api/kpis
const KPIS_MONOLITICOS = ['flujo-caja', 'cierre-mensual', 'ordenes-cumplidas', 'costo-produccion', 'calidad-registro', 'rotacion-personal', 'obligaciones-por-vencer'] as const;
// Orden de visualización de todos los KPIs
const KPI_ORDER = ['ventas-meta', 'margen-caja', 'cartera-asesores', 'flujo-caja', 'cierre-mensual', 'ordenes-cumplidas', 'costo-produccion', 'calidad-registro', 'rotacion-personal', 'obligaciones-por-vencer'];

const KPI_META: Record<string, { nombre: string; area: string }> = {
  'ventas-meta':             { nombre: 'Ventas Reales (Facturado)',  area: 'Ventas' },
  'margen-caja':             { nombre: 'Margen de caja',          area: 'Finanzas' },
  'cartera-asesores':        { nombre: 'CxC por Asesor',          area: 'Cartera' },
  'flujo-caja':              { nombre: 'Flujo de caja disponible', area: 'Finanzas' },
  'cierre-mensual':          { nombre: '% Cierre mensual',        area: 'Todas las áreas' },
  'ordenes-cumplidas':       { nombre: 'Órdenes Cumplidas',       area: 'Producción' },
  'costo-produccion':        { nombre: 'Producción Cumplida (Valorizada)',     area: 'Producción' },
  'calidad-registro':        { nombre: 'Calidad de Registro',     area: 'Producción' },
  'rotacion-personal':       { nombre: 'Rotación de personal',    area: 'Talento Humano' },
  'obligaciones-por-vencer': { nombre: 'Obligaciones por vencer', area: 'Proveedores' },
};

interface KPIWidgetState {
  data: KPI | null;
  raw: KPIReal | null;
  loading: boolean;
  error: string | null;
}

function Dashboard({ onNavegar }: { onNavegar: (vista: Vista) => void }) {
  const [periodo, setPeriodo] = useState<string>(periodoActual);
  const [widgets, setWidgets] = useState<Record<string, KPIWidgetState>>({});
  const [rawKpisMap, setRawKpisMap] = useState<Record<string, KPIReal>>({});
  const [fuentesListas, setFuentesListas] = useState(0);
  const [fuentesTotales] = useState(4); // ventas, cartera, margen, monolítico
  const [tarjetasConfig, setTarjetasConfig] = useState<TarjetaDashboard[] | null>(null);
  
  const [reporteOrdenes, setReporteOrdenes] = useState<KPIReal | null>(null);
  const [opSeleccionada, setOpSeleccionada] = useState<string | null>(null);

  // Cargar configuración de tarjetas (una sola vez)
  useEffect(() => {
    fetchTarjetasDashboard()
      .then(setTarjetasConfig)
      .catch(() => setTarjetasConfig(null)); // fallback a KPI_ORDER
  }, []);

  // Orden dinámico: usa config de BD si existe, si no el hardcoded
  const visibleKpiOrder = tarjetasConfig
    ? tarjetasConfig.filter(t => t.visible).map(t => t.clave)
    : KPI_ORDER;

  // Inicializar estado de todos los widgets como loading
  useEffect(() => {
    const initial: Record<string, KPIWidgetState> = {};
    KPI_ORDER.forEach(id => {
      initial[id] = { data: null, raw: null, loading: true, error: null };
    });
    setWidgets(initial);
    setRawKpisMap({});
    setFuentesListas(0);

    // Helper para actualizar un widget específico
    const updateWidget = (id: string, raw: KPIReal) => {
      const data = adaptarKPI(raw);
      
      if (id === 'costo-produccion') {
        const { fecha_inicio, fecha_fin } = periodoToRango(periodo);
        data.onClickValor = () => {
          const url = new URL(window.location.href);
          url.searchParams.set('fecha_inicio', fecha_inicio);
          url.searchParams.set('fecha_fin', fecha_fin);
          url.searchParams.set('margen', '0');
          window.history.pushState({}, '', url);
          onNavegar('costo-produccion-detalle');
        };
        data.onClickSubtexto = () => {
          const url = new URL(window.location.href);
          url.searchParams.set('fecha_inicio', fecha_inicio);
          url.searchParams.set('fecha_fin', fecha_fin);
          url.searchParams.set('margen', String(raw.metaMargenProduccion || 18));
          window.history.pushState({}, '', url);
          onNavegar('costo-produccion-detalle');
        };
      }

      if (id === 'ordenes-cumplidas') {
        data.onClickReporte = () => setReporteOrdenes(raw);
      }

      setWidgets(prev => ({
        ...prev,
        [id]: { data, raw, loading: false, error: null },
      }));
      setRawKpisMap(prev => ({ ...prev, [id]: raw }));
    };

    const failWidget = (id: string, errorMsg: string) => {
      setWidgets(prev => ({
        ...prev,
        [id]: { data: null, raw: null, loading: false, error: errorMsg },
      }));
    };

    // ── Fuente 1: /api/ventas_mes (endpoint independiente) ─────────────
    fetchVentasMes(periodo)
      .then(raw => updateWidget('ventas-meta', raw))
      .catch(err => failWidget('ventas-meta', err.message))
      .finally(() => setFuentesListas(n => n + 1));

    // ── Fuente 2: /api/cartera_por_asesor (endpoint independiente) ─────
    fetchCarteraAsesor()
      .then(raw => updateWidget('cartera-asesores', raw))
      .catch(err => failWidget('cartera-asesores', err.message))
      .finally(() => setFuentesListas(n => n + 1));

    // ── Fuente 3: /api/margen_global (endpoint independiente) ──────────
    fetchMargenGlobal(periodo)
      .then(raw => updateWidget('margen-caja', raw))
      .catch(err => failWidget('margen-caja', err.message))
      .finally(() => setFuentesListas(n => n + 1));

    // ── Fuente 4: /api/kpis (monolítico, para KPIs sin endpoint propio) ─
    fetchKPIs(periodo)
      .then(resp => {
        KPIS_MONOLITICOS.forEach(id => {
          const raw = Object.values(resp.kpis).find((k: any) => k.id === id);
          if (raw) {
            updateWidget(id, raw as KPIReal);
          } else {
            failWidget(id, 'KPI no encontrado en respuesta');
          }
        });
      })
      .catch(err => {
        KPIS_MONOLITICOS.forEach(id => failWidget(id, err.message));
      })
      .finally(() => setFuentesListas(n => n + 1));

  }, [periodo]);

  const ahora = new Date();
  const saludo = ahora.getHours() < 12 ? 'Buenos días' : ahora.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  const fechaFormateada = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const periodos = generarPeriodos();

  const todoCargando = fuentesListas === 0;
  const todoListo = fuentesListas >= fuentesTotales;
  const hayErrores = Object.values(widgets).some(w => w.error);

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold capitalize">{saludo}, Pedro</h2>
          <p className="text-dashboard-textMuted text-sm mt-1 capitalize">{fechaFormateada}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-probolsas-navy flex items-center justify-center text-white font-bold text-sm">PS</div>
      </header>

      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-dashboard-textMain">KPIs del período</h3>
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-dashboard-textMain focus:outline-none focus:ring-2 focus:ring-probolsas-navy/30 cursor-pointer"
          >
            {periodos.map(p => (
              <option key={p} value={p}>{periodoLabel(p)}</option>
            ))}
          </select>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full border ${
          todoCargando ? 'bg-slate-50 border-slate-200 text-slate-500' :
          hayErrores ? 'bg-amber-50 border-amber-200 text-amber-700' :
          'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {todoCargando ? 'Cargando datos…' :
           !todoListo ? `Cargando… (${fuentesListas}/${fuentesTotales} fuentes)` :
           hayErrores ? 'Algunos indicadores con error' :
           'Datos en tiempo real — crisolweb'}
        </span>
      </div>

      {todoListo && !hayErrores && Object.keys(rawKpisMap).length > 0 && (
        <AlertasPanel kpis={rawKpisMap} />
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {visibleKpiOrder.map(id => {
          const w = widgets[id];
          if (!w || w.loading) return <KPICardSkeleton key={id} />;
          if (w.error) return <KPICardError key={id} nombre={KPI_META[id]?.nombre ?? id} area={KPI_META[id]?.area ?? ''} />;
          if (w.data) return <KPICard key={id} kpi={w.data} />;
          return <KPICardSkeleton key={id} />;
        })}
      </section>

      {/* MODAL DE REPORTE ÓRDENES CRÍTICAS */}
      {reporteOrdenes && (
        <InformePDFModal
          tipoInforme="ordenes-criticas"
          requestData={{ periodo }}
          titulo="Órdenes en Producción Críticas"
          entidadLabel="Período"
          entidadValue={formatPeriodo(periodo)}
          firmaLabel="Líder de Planta"
          firmaDerechaLabel="Gerencia Operativa"
          onClose={() => setReporteOrdenes(null)}
          infoExtra={
            <div className="mt-2 text-sm text-slate-500">
              <p>OPs totales producidas: {reporteOrdenes.ordenes}</p>
              <p>OPs críticas por atraso: {reporteOrdenes.opsCriticas}</p>
              {reporteOrdenes.fechaActualizacion && (
                <p className="mt-2 text-xs">Datos calculados hasta: {new Date(reporteOrdenes.fechaActualizacion).toLocaleDateString('es-CO')} {reporteOrdenes.desactualizado && '(Con retraso)'}</p>
              )}
            </div>
          }
        >
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">Detalle de Órdenes Críticas</h3>
            {reporteOrdenes.listaCriticas && reporteOrdenes.listaCriticas.length > 0 ? (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 uppercase tracking-wider text-xs border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold">Nro OP</th>
                    <th className="px-4 py-3 font-semibold">Referencia</th>
                    <th className="px-4 py-3 font-semibold text-right">Días Atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reporteOrdenes.listaCriticas.map((op, idx) => (
                    <tr key={idx} onClick={() => setOpSeleccionada(op.nro_op)} className="hover:bg-slate-50 cursor-pointer print:hover:bg-transparent">
                      <td className="px-4 py-3 font-medium text-slate-800">{op.nro_op}</td>
                      <td className="px-4 py-3 text-slate-600">{op.referencia}</td>
                      <td className="px-4 py-3 font-bold text-red-600 text-right">{op.dias_atraso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-lg">
                <p className="text-slate-500">No hay órdenes críticas registradas en este período.</p>
              </div>
            )}
          </div>
        </InformePDFModal>
      )}

      {/* MODAL TRAZABILIDAD (desde el reporte PDF) */}
      {opSeleccionada && (
        <OpTrazabilidadModal
          nro_op={opSeleccionada}
          onClose={() => setOpSeleccionada(null)}
        />
      )}
    </div>
  );
}

// ── Vista Diario (Nueva) ───────────────────────────────────────────────────────

function getAyerISO(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function DailyDashboard() {
  const [fecha, setFecha] = useState<string>(getAyerISO());
  const [diario, setDiario] = useState<KPIDiario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    fetchKPIs(undefined, fecha)
      .then(resp => {
        if (resp.diario) setDiario(resp.diario);
        else setError('No hay datos disponibles para esta fecha');
      })
      .catch(err => setError(err.message))
      .finally(() => setCargando(false));
  }, [fecha]);


  const ahora = new Date();
  const saludo = ahora.getHours() < 12 ? 'Buenos días' : ahora.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  const fechaFormateada = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold capitalize">{saludo}, Pedro</h2>
          <p className="text-dashboard-textMuted text-sm mt-1 capitalize">{fechaFormateada}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-probolsas-navy flex items-center justify-center text-white font-bold text-sm">PS</div>
      </header>

      {cargando ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-dashboard-textMuted animate-pulse">Obteniendo datos de hoy…</p>
        </div>
      ) : error ? (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl text-amber-800">
          <p className="font-bold mb-1">Hubo un problema al cargar el vistazo diario</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      ) : diario ? (
        <VistazoDiario 
          data={diario} 
          fechaSeleccionada={fecha} 
          onCambiarFecha={setFecha} 
        />
      ) : null}

    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [vistaActual, setVistaActual] = useState<Vista>('dashboard');
  const [informes, setInformes]       = useState<InformeCierre[]>([]);
  const [errorEnvio, setErrorEnvio]   = useState<string | null>(null);

  // Auth State
  const [user, setUser] = useState<Usuario | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));

    const onAuthError = () => {
      setUser(null);
    };
    window.addEventListener('auth-error', onAuthError);
    return () => window.removeEventListener('auth-error', onAuthError);
  }, []);

  async function handleLogout() {
    await apiLogout();
    setUser(null);
  }

  // Carga los informes históricos desde Sheets al abrir la bandeja
  useEffect(() => {
    if (vistaActual !== 'bandeja-aprobacion') return;
    fetchBandeja()
      .then(({ informes: sheetRows }) => {
        setInformes(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const nuevos = sheetRows
            .filter(r => r.ID_Registro && !existingIds.has(r.ID_Registro))
            .map(r => ({
              id:                  r.ID_Registro,
              area:                r.Área as InformeCierre['area'],
              periodo:             r.Período,
              estado:              r.Estado as InformeCierre['estado'],
              responsable:         r.Responsable,
              fechaEnvio:          r.Fecha_Envio,
              fechaAprobacion:     r.Fecha_Aprobacion || undefined,
              comentarioGerencia:  r.Comentario_Gerencia || undefined,
              datos:               {},
            }));
          return [...prev, ...nuevos];
        });
      })
      .catch(err => console.warn('No se pudo cargar bandeja desde Sheets:', err.message));
  }, [vistaActual]);

  async function registrarEnvio(datos: Omit<InformeCierre, 'id' | 'estado' | 'fechaEnvio'>) {
    setErrorEnvio(null);
    try {
      // Intenta escribir en Google Sheets vía backend
      const resp = await enviarCierre(datos.area, datos.datos);
      const nuevo: InformeCierre = {
        ...datos,
        id: resp.id_registro,   // ID real del Sheet
        estado: 'ENVIADO',
        fechaEnvio: new Date().toISOString(),
      };
      setInformes(prev => [nuevo, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error al enviar a Sheets:', msg);
      setErrorEnvio(msg);
      // Registra localmente igual para no perder el flujo
      setInformes(prev => [{
        ...datos,
        id: `local-${Date.now()}`,
        estado: 'ENVIADO',
        fechaEnvio: new Date().toISOString(),
      }, ...prev]);
    }
    setTimeout(() => setVistaActual('bandeja-aprobacion'), 1500);
  }

  async function aprobar(id: string) {
    const informe = informes.find(i => i.id === id);
    if (!informe) return;
    try {
      await actualizarEstadoCierre(informe.area as AreaCierre, id, 'APROBADO');
    } catch (err) {
      console.error('Error al aprobar en Sheets:', err);
    }
    setInformes(prev => prev.map(i =>
      i.id === id ? { ...i, estado: 'APROBADO', fechaAprobacion: new Date().toISOString() } : i
    ));
  }

  async function rechazar(id: string, comentario: string) {
    const informe = informes.find(i => i.id === id);
    if (!informe) return;
    try {
      await actualizarEstadoCierre(informe.area as AreaCierre, id, 'RECHAZADO', comentario);
    } catch (err) {
      console.error('Error al rechazar en Sheets:', err);
    }
    setInformes(prev => prev.map(i =>
      i.id === id ? { ...i, estado: 'RECHAZADO', fechaAprobacion: new Date().toISOString(), comentarioGerencia: comentario } : i
    ));
  }

  const pendientes = informes.filter(i => i.estado === 'ENVIADO').length;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 bg-probolsas-navy/20 rounded-2xl mb-4"></div>
          <p className="text-slate-500 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <AuthContext.Provider value={{ user, logout: handleLogout }}>
      <Layout vistaActual={vistaActual} onNavegar={setVistaActual} pendientesAprobacion={pendientes}>
      {errorEnvio && (
        <div className="fixed bottom-4 right-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl shadow-md z-50 max-w-sm">
          ⚠ El informe se guardó localmente pero no pudo escribirse en Sheets: {errorEnvio}
        </div>
      )}
      {vistaActual === 'dashboard'              && <Dashboard onNavegar={setVistaActual} />}
      {vistaActual === 'vista-diaria'           && <DailyDashboard />}
      {vistaActual === 'cierre-ventas'          && <CierreVentasForm         onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-finanzas'        && <CierreFinanzasForm       onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-produccion'      && <CierreProduccionForm     onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-cartera'         && <CierreCarteraForm        onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-talento-humano'  && <CierreTalentoHumanoForm  onEnviar={registrarEnvio} />}
      {vistaActual === 'bandeja-aprobacion'     && <BandejaAprobacion informes={informes} onAprobar={aprobar} onRechazar={rechazar} />}
      {vistaActual === 'costo-produccion-detalle' && <CostoProduccionDetalle />}
      {vistaActual === 'analisis-responsables'    && <AnalisisResponsables />}
      {vistaActual === 'analisis-materiales'      && <AnalisisMateriales />}
      {vistaActual === 'movimiento-materiales'    && <MovimientoMateriales />}
      {vistaActual === 'configuracion'            && <ConfiguracionMetas />}
      {vistaActual === 'usuarios'                 && <Usuarios />}
    </Layout>
    </AuthContext.Provider>
  );
}
