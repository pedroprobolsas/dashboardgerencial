import { useState, useEffect } from 'react';
import Layout from './components/Layout/Layout';
import { type Vista } from './components/Layout/Sidebar';
import KPICard from './components/Dashboard/KPICard';
import AlertasPanel from './components/Dashboard/AlertasPanel';
import CierreVentasForm from './components/Forms/CierreVentasForm';
import CierreFinanzasForm from './components/Forms/CierreFinanzasForm';
import CierreProduccionForm from './components/Forms/CierreProduccionForm';
import CierreCarteraForm from './components/Forms/CierreCarteraForm';
import CierreTalentoHumanoForm from './components/Forms/CierreTalentoHumanoForm';
import BandejaAprobacion from './components/Aprobaciones/BandejaAprobacion';
import { kpis as kpisMock, type KPI, type AlertaColor, type FilaGrid } from './data/kpis';
import { fetchKPIs, enviarCierre, actualizarEstadoCierre, fetchBandeja, type KPIReal, type KPIDiario } from './services/api';
import VistazoDiario from './components/Dashboard/VistazoDiario';
import type { InformeCierre, AreaCierre } from './types/cierres';

// ── Adaptador: KPIReal (backend) → KPI (componente tarjeta) ──────────────────

function adaptarKPI(raw: KPIReal): KPI {
  const alerta: AlertaColor = (raw.alerta as AlertaColor) ?? 'amarillo';

  const descEstado = raw.fuente === 'real'
    ? (alerta === 'verde' ? 'Normal' : alerta === 'amarillo' ? 'Precaución' : 'Alerta')
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
    const descMargen = alerta === 'verde' ? 'Margen saludable' : alerta === 'amarillo' ? 'Margen ajustado' : 'Margen crítico';
    return {
      ...base,
      descripcionAlerta: descMargen,
      subtexto: raw.detalle || undefined,
    };
  }

  // ── Flujo de caja: desglose ingresos/egresos + días de caja disponibles ───
  if (raw.id === 'flujo-caja') {
    const descFlujo = alerta === 'verde' ? 'Flujo positivo' : alerta === 'amarillo' ? 'Flujo bajo' : 'Flujo negativo';
    const diasLabel = raw.diasCajaDisponibles != null
      ? (raw.diasCajaDisponibles < 1
          ? 'Runway: < 1 día'
          : `Runway: ${raw.diasCajaDisponibles.toFixed(1)} días`)
      : null;
    const subtexto = [raw.detalle, diasLabel].filter(Boolean).join(' | ');
    return {
      ...base,
      descripcionAlerta: descFlujo,
      subtexto: subtexto || undefined,
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
    const descProd = alerta === 'verde' ? 'En meta' : alerta === 'amarillo' ? 'Con desviaciones' : 'Crítico';

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

  // ── Obligaciones por vencer: total + desglose por rango de días ─────────────
  if (raw.id === 'obligaciones-por-vencer' && raw.fuente === 'real') {
    const descOblig = raw.alerta === 'verde' ? 'Al día' : raw.alerta === 'amarillo' ? 'Con vencidos' : 'Vencidos urgentes';
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
    const descRot = alerta === 'verde' ? 'Normal' : alerta === 'amarillo' ? 'Moderada' : 'Alta';
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

function Dashboard() {
  const [periodo, setPeriodo] = useState<string>(periodoActual);
  const [kpisData, setKpisData] = useState<KPI[]>(kpisMock);
  const [rawKpisMap, setRawKpisMap] = useState<Record<string, KPIReal>>({});
  const [cargando, setCargando] = useState(true);
  const [errorAPI, setErrorAPI] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setErrorAPI(null);
    fetchKPIs(periodo)
      .then(resp => {
        setRawKpisMap(resp.kpis);
        const adaptados = Object.values(resp.kpis).map(adaptarKPI);
        setKpisData(adaptados);
      })
      .catch(err => {
        console.error('No se pudo leer KPIs del backend:', err.message);
        setErrorAPI(err.message);
      })
      .finally(() => setCargando(false));
  }, [periodo]);

  const ahora = new Date();
  const saludo = ahora.getHours() < 12 ? 'Buenos días' : ahora.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  const fechaFormateada = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const periodos = generarPeriodos();

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
          {/* Selector de período */}
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
          errorAPI ? 'bg-amber-50 border-amber-200 text-amber-700' :
          cargando ? 'bg-slate-50 border-slate-200 text-slate-500' :
          'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {cargando ? 'Cargando datos…' : errorAPI ? 'Usando datos de respaldo' : 'Datos en tiempo real — crisolweb'}
        </span>
      </div>

      {!cargando && !errorAPI && Object.keys(rawKpisMap).length > 0 && (
        <AlertasPanel kpis={rawKpisMap} />
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {kpisData.map(kpi => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </section>

      {errorAPI && (
        <p className="text-xs text-amber-600 -mt-4 mb-4">
          ⚠ Backend no disponible ({errorAPI}). Mostrando datos de demostración.
        </p>
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

  return (
    <Layout vistaActual={vistaActual} onNavegar={setVistaActual} pendientesAprobacion={pendientes}>
      {errorEnvio && (
        <div className="fixed bottom-4 right-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl shadow-md z-50 max-w-sm">
          ⚠ El informe se guardó localmente pero no pudo escribirse en Sheets: {errorEnvio}
        </div>
      )}
      {vistaActual === 'dashboard'              && <Dashboard />}
      {vistaActual === 'vista-diaria'           && <DailyDashboard />}
      {vistaActual === 'cierre-ventas'          && <CierreVentasForm         onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-finanzas'        && <CierreFinanzasForm       onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-produccion'      && <CierreProduccionForm     onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-cartera'         && <CierreCarteraForm        onEnviar={registrarEnvio} />}
      {vistaActual === 'cierre-talento-humano'  && <CierreTalentoHumanoForm  onEnviar={registrarEnvio} />}
      {vistaActual === 'bandeja-aprobacion'     && <BandejaAprobacion informes={informes} onAprobar={aprobar} onRechazar={rechazar} />}
    </Layout>
  );
}
