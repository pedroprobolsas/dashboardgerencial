// Cliente HTTP para el backend Express en /api/*
// En desarrollo, Vite proxía /api → http://localhost:3001

// ── Auth ───────────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: 'admin' | 'usuario';
}

export async function login(email: string, password: string): Promise<Usuario> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Credenciales inválidas');
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  // Opcional: limpiar cache si es necesario
}

export async function fetchMe(): Promise<Usuario> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) throw new Error('No autenticado');
  const data = await res.json();
  return data.user;
}

// Interceptor simple de errores: si una llamada a la API retorna 401, se dispara un evento global
function checkAuthError(res: Response) {
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth-error'));
  }
}

// ── Usuarios (CRUD) ──────────────────────────────────────────────────────────

export async function fetchUsuarios(): Promise<Usuario[]> {
  const res = await fetch('/api/usuarios');
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return data.usuarios || [];
}

export async function createUsuario(datos: Omit<Usuario, 'id'> & { password?: string }): Promise<Usuario> {
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  checkAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  const data = await res.json();
  return data.usuario;
}

export async function updateUsuario(id: number, datos: Partial<Usuario> & { activo?: boolean }): Promise<Usuario> {
  const res = await fetch(`/api/usuarios/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  checkAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  const data = await res.json();
  return data.usuario;
}

export async function resetPassword(id: number, newPassword: string): Promise<void> {
  const res = await fetch(`/api/usuarios/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  checkAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
}



export interface KPIReal {
  id: string;
  nombre: string;
  area: string;
  fuente: 'real' | 'pendiente_mapeo' | 'cierre_produccion' | 'cierre_talento_humano' | 'error';
  sinDatos?: boolean;   // true cuando el período no tiene registros (evita falsas alarmas)
  valor?: number;
  valorFormateado?: string;
  valorAbsoluto?: string;
  meta?: string;
  alerta?: 'verde' | 'amarillo' | 'rojo';
  detalle?: string;
  nota?: string;
  desglose?: { d30?: string; d60?: string; d90?: string; d100plus?: string };
  ordenes?: number;
  opsCriticas?: number;
  opsAtrasadas?: number;
  totalDiasAtraso?: number;
  opsConPerdida?: number;
  margenProduccion?: number;
  valorProducido?: string;
  costoEjecutado?: string;
  utilidadProduccion?: string;
  ahorroPresupuesto?: string;
  ahorroNumerico?: number;
  // Talento Humano
  totalEmpleados?: number;
  retiros?: number;
  diasAusentismo?: string;
  incidentesSeguridad?: string;
  // Obligaciones por vencer
  totalPorVencer?: string;
  totalVencidoPorPagar?: string;
  desgloseVencimientos?: { vencido?: string; d15?: string; d30?: string; d60?: string; d60plus?: string };
  topProveedores?: Array<{ nombre: string; monto: string }>;
  // Ventas: desglose bruto / IVA / neto
  valorBruto?: string;
  valorIva?: string;
  valorNetoTotal?: string;
  // Raw numbers para cálculos en AlertasPanel (flujo_caja)
  egresosRaw?: number;
  flujoRaw?: number;
  diasCajaDisponibles?: number;
  // Cartera por asesor
  topAsesores?: Array<{ nombre: string; saldo: string; vencido: string }>;
  vencidoRaw?: number;
  corrienteRaw?: number;
  // Raw numbers para cálculos en AlertasPanel (obligaciones_por_vencer)
  totalVencidoRaw?: number;
  d15Raw?: number;
  d30Raw?: number;
}

export interface KPIDiario {
  hoy: {
    ventas:     { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    egresos:    { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    cobros:     { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    saldo_neto: { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    crudo: { ventasHoy: number; egresosHoy: number; cobrosHoy: number };
  };
  mes: {
    ventas:     { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    egresos:    { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    cobros:     { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    flujo_neto: { valor: string; alerta: 'verde' | 'amarillo' | 'rojo' };
    meta_ventas: string;
    pct_ventas: string;
    crudo: { ventasMes: number; egresosMes: number; cobrosMes: number; metaVentas: number };
  };
}

export interface InformeBandeja {
  ID_Registro: string;
  Período: string;
  Área: string;
  Responsable: string;
  Fecha_Envio: string;
  Estado: string;
  Comentario_Gerencia?: string;
  Fecha_Aprobacion?: string;
}

export async function fetchBandeja(): Promise<{ informes: InformeBandeja[] }> {
  const res = await fetch('/api/cierres/bandeja');
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar bandeja`);
  return res.json();
}

export interface RespuestaKPIs {
  periodo: string;
  kpis: Record<string, KPIReal>;
  diario?: KPIDiario;
}

export async function fetchKPIs(periodo?: string, fecha?: string): Promise<RespuestaKPIs> {
  const params = new URLSearchParams();
  if (periodo) params.append('periodo', periodo);
  if (fecha) params.append('fecha', fecha);
  
  const queryString = params.toString();
  const url = queryString ? `/api/kpis?${queryString}` : '/api/kpis';
  
  const res = await fetch(url);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status} al leer KPIs`);
  return res.json();
}

export interface LineaMaterial {
  nro_op: string;
  fecha: string;
  referencia: string;
  material: string;
  cant_cotizada: number;
  cant_ejecutada: number;
  diferencia_cant_pct: number | string | null;
  valor_cotizado: number;
  valor_ejecutado: number;
  cumplimiento: number;
  precio_cotizado: number | null;
  precio_real: number | null;
  efecto_cantidad: number | null;
  efecto_precio: number | null;
  op_cantidad_cotizada: number | null;
  op_cantidad_ejecutada: number | null;
  calculable: boolean;
  tipo_especial?: 'alias' | 'cotizado_sin_usar' | 'sustitucion' | 'consumo_extra' | 'normal' | null;
  par_id?: string;
}

export async function fetchAnalisisMateriales(fechaInicio: string, fechaFin: string): Promise<{ detalle: LineaMaterial[], total: number }> {
  const res = await fetch(`/api/analisis_materiales?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return {
    detalle: data.detalle || [],
    total: data.total || 0,
  };
}

// ── Parámetros y Configuración ────────────────────────────────────────────────

export interface Parametro {
  valor: number;
  unidad?: string;
  descripcion?: string;
  categoria?: string;
  vigente_desde: string;
  vigente_hasta?: string;
  modificado_por: string;
  modificado_en?: string;
  clave?: string;
  id?: number;
}

export async function fetchParametros(fecha?: string): Promise<Record<string, Parametro>> {
  const url = fecha ? `/api/parametros?fecha=${fecha}` : '/api/parametros';
  const res = await fetch(url);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return data.parametros || {};
}

export async function fetchHistorialParametros(): Promise<Parametro[]> {
  const res = await fetch('/api/parametros/historico');
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return data.historico || [];
}

export async function updateParametro(clave: string, valor: number): Promise<void> {
  const res = await fetch('/api/parametros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave, valor }),
  });
  checkAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status} al actualizar parámetro`);
  }
}


// ── Endpoints REST independientes ─────────────────────────────────────────────

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Convierte periodo 'YYYY-MM' a { fecha_inicio, fecha_fin } */
function periodoToRango(periodo: string): { fecha_inicio: string; fecha_fin: string } {
  const [y, m] = periodo.split('-').map(Number);
  const fecha_inicio = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const fecha_fin = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { fecha_inicio, fecha_fin };
}

export async function fetchVentasMes(periodo: string): Promise<KPIReal> {
  const { fecha_inicio, fecha_fin } = periodoToRango(periodo);
  const res = await fetch(`/api/ventas_mes?fecha_inicio=${fecha_inicio}&fecha_fin=${fecha_fin}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  const bruto = data.resumen.total_bruto;
  const iva = data.resumen.total_iva;
  const neto = data.resumen.total_neto;
  const meta = data.meta_ventas || 200000000;
  const pct = meta > 0 ? Math.round((bruto / meta) * 100) : 0;
  return {
    id: 'ventas-meta', nombre: 'Ventas del mes vs meta', area: 'Ventas',
    fuente: bruto === 0 && data.resumen.facturas === 0 ? 'real' : 'real',
    sinDatos: data.resumen.facturas === 0,
    valor: pct,
    valorFormateado: `${pct}%`,
    valorBruto: fmtCOP.format(bruto),
    valorIva: fmtCOP.format(iva),
    valorNetoTotal: fmtCOP.format(neto),
    meta: `Meta: ${fmtCOP.format(meta)}`,
    alerta: pct >= 90 ? 'verde' : pct >= 80 ? 'amarillo' : 'rojo',
  };
}

export async function fetchCarteraAsesor(): Promise<KPIReal> {
  const res = await fetch('/api/cartera_por_asesor');
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  const { total, vencido, corriente, pct_vencido } = data.resumen;
  return {
    id: 'cartera-asesores', nombre: 'CxC por Asesor', area: 'Cartera',
    fuente: 'real',
    valor: total,
    valorFormateado: fmtCOP.format(total),
    meta: `Vencido: ${fmtCOP.format(vencido)} (${pct_vencido}%)`,
    detalle: `Vencido: ${fmtCOP.format(vencido)} | Corriente: ${fmtCOP.format(corriente)}`,
    vencidoRaw: vencido,
    corrienteRaw: corriente,
    topAsesores: data.asesores.slice(0, 4).map((a: { asesor: string; saldo_total: number; vencido: number }) => ({
      nombre: a.asesor,
      saldo: fmtCOP.format(a.saldo_total),
      vencido: fmtCOP.format(a.vencido),
    })),
    alerta: pct_vencido <= 20 ? 'verde' : pct_vencido <= 40 ? 'amarillo' : 'rojo',
  };
}

export async function fetchMargenGlobal(periodo: string): Promise<KPIReal> {
  const { fecha_inicio, fecha_fin } = periodoToRango(periodo);
  const res = await fetch(`/api/margen_global?fecha_inicio=${fecha_inicio}&fecha_fin=${fecha_fin}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return {
    id: 'margen-caja', nombre: 'Margen de caja', area: 'Finanzas',
    fuente: 'real',
    sinDatos: data.ventas === 0,
    valor: data.margen_pct,
    valorFormateado: `${data.margen_pct}%`,
    valorAbsoluto: data.margen_absoluto_fmt,
    detalle: `Ventas: ${data.ventas_fmt} | Egresos: ${data.egresos_fmt}`,
    meta: 'Meta: ≥ 35%',
    alerta: data.alerta,
  };
}

export interface OrdenProduccion {
  nro_op: string;
  cliente: string;
  referencia: string;
  fecha: string;
  costo_total_estimado: number;
  costo_ejecutado_total: number;
  valor_cumplido: number;
  margen_pct: number;
}

export interface CostoPorOrdenResumen {
  ultima_actualizacion: string | null;
  total_ops: number;
  margen_promedio: number;
  valor_facturado: number;
  ops_bajo_umbral: number;
}

export async function fetchCostoPorOrden(fechaInicio: string, fechaFin: string, margenMinimo: number): Promise<{ ordenes: OrdenProduccion[], total: number, resumen: CostoPorOrdenResumen }> {
  const res = await fetch(`/api/costo_por_orden?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}&margen_minimo=${margenMinimo}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return {
    ordenes: data.ordenes || [],
    total: data.total || 0,
    resumen: data.resumen || { ultima_actualizacion: null, total_ops: 0, margen_promedio: 0, valor_facturado: 0, ops_bajo_umbral: 0 },
  };
}

export interface LineaOPDetalle {
  item: string;
  categoria: string;
  cant_cotizada: number;
  cant_ejecutada: number;
  valor_cotizado: number;
  valor_ejecutado: number;
  cumplimiento: number;
  diferencia_pct: number | null;
  efecto_horas: number | null;
  efecto_tarifa: number | null;
  unidad?: string | null;
}

export interface OPDetalleData {
  ok: boolean;
  cabecera: {
    nro_op: string;
    cliente: string;
    referencia: string;
    fecha: string;
    margen_pct: number;
    op_cantidad_cotizada: string | number | null;
    op_cantidad_ejecutada: string | number | null;
  };
  detalle: LineaOPDetalle[];
}

export async function fetchCostoPorOrdenDetalle(nro_op: string): Promise<OPDetalleData> {
  const res = await fetch(`/api/costo_por_orden/${nro_op}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export interface LineaResponsable {
  nro_op: string;
  referencia: string;
  actividad: string;
  cant_cotizada: number;
  cant_ejecutada: number;
  valor_cotizado: number;
  valor_ejecutado: number;
  cumplimiento: number;
  diferencia_horas: number;
  diferencia_horas_pct: number | null;
  tarifa_cotizada: number | null;
  tarifa_real: number;
  efecto_horas: number | null;
  efecto_tarifa: number | null;
}

export interface IndicadoresResponsables {
  jesus_efecto_horas: number;
  cristian_efecto_tarifa: number;
}

export async function fetchAnalisisResponsables(fechaInicio: string, fechaFin: string): Promise<{ detalle: LineaResponsable[], indicadores: IndicadoresResponsables, total: number }> {
  const res = await fetch(`/api/analisis_responsables?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return {
    detalle: data.detalle || [],
    indicadores: data.indicadores || { jesus_efecto_horas: 0, cristian_efecto_tarifa: 0 },
    total: data.total || 0,
  };
}

export async function enviarCierre(
  area: string,
  datos: Record<string, string>
): Promise<{ id_registro: string; periodo: string }> {
  const res = await fetch(`/api/cierres/${area}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  checkAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status} al enviar cierre`);
  }
  return res.json();
}

export async function actualizarEstadoCierre(
  area: string,
  idRegistro: string,
  estado: 'APROBADO' | 'RECHAZADO',
  comentarioGerencia?: string
): Promise<void> {
  const res = await fetch(`/api/cierres/${area}/${idRegistro}/estado`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado, comentario_gerencia: comentarioGerencia }),
  });
  checkAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status} al actualizar estado`);
  }
}

// ── Pre-llenado de formularios ────────────────────────────────────────────────

export interface DatoPrellenado {
  valor: number;
  etiqueta: string;
}

export interface RespuestaPrefill {
  ok: boolean;
  periodo: string;
  area: string;
  campos: Record<string, DatoPrellenado>;
}

export async function fetchPrefill(area: string, periodo: string): Promise<RespuestaPrefill> {
  const res = await fetch(`/api/cierres/prefill/${area}?periodo=${periodo}`);
  checkAuthError(res);
  if (!res.ok) throw new Error(`Error ${res.status} al obtener datos del sistema`);
  return res.json();
}
