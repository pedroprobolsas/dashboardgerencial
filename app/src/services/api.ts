// Cliente HTTP para el backend Express en /api/*
// En desarrollo, Vite proxía /api → http://localhost:3001

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
  if (!res.ok) throw new Error(`Error ${res.status} al leer KPIs`);
  return res.json();
}

export interface LineaMaterial {
  nro_op: string;
  referencia: string;
  material: string;
  cant_cotizada: number;
  cant_esperada: number | null;
  cant_ejecutada: number;
  diferencia_cant_pct: number | string | null;
  valor_cotizado: number;
  valor_ejecutado: number;
  cumplimiento: number;
  precio_cotizado: number | null;
  precio_real: number | null;
  efecto_volumen: number | null;
  efecto_rendimiento: number | null;
  efecto_precio: number | null;
  calculable: boolean;
}

export async function fetchAnalisisMateriales(fechaInicio: string, fechaFin: string): Promise<{ detalle: LineaMaterial[], total: number }> {
  const res = await fetch(`/api/analisis_materiales?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return {
    detalle: data.detalle || [],
    total: data.total || 0,
  };
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
}

export interface OPDetalleData {
  ok: boolean;
  cabecera: {
    nro_op: string;
    cliente: string;
    referencia: string;
    fecha: string;
    margen_pct: number;
  };
  detalle: LineaOPDetalle[];
}

export async function fetchCostoPorOrdenDetalle(nro_op: string): Promise<OPDetalleData> {
  const res = await fetch(`/api/costo_por_orden/${nro_op}`);
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
  if (!res.ok) throw new Error(`Error ${res.status} al obtener datos del sistema`);
  return res.json();
}

 e x p o r t   i n t e r f a c e   L i n e a M a t e r i a l   { 
     n r o _ o p :   s t r i n g ; 
     r e f e r e n c i a :   s t r i n g ; 
     m a t e r i a l :   s t r i n g ; 
     c a n t _ c o t i z a d a :   n u m b e r ; 
     c a n t _ e s p e r a d a :   n u m b e r   |   n u l l ; 
     c a n t _ e j e c u t a d a :   n u m b e r ; 
     d i f e r e n c i a _ c a n t _ p c t :   n u m b e r   |   s t r i n g   |   n u l l ; 
     v a l o r _ c o t i z a d o :   n u m b e r ; 
     v a l o r _ e j e c u t a d o :   n u m b e r ; 
     c u m p l i m i e n t o :   n u m b e r ; 
     p r e c i o _ c o t i z a d o :   n u m b e r   |   n u l l ; 
     p r e c i o _ r e a l :   n u m b e r   |   n u l l ; 
     e f e c t o _ v o l u m e n :   n u m b e r   |   n u l l ; 
     e f e c t o _ r e n d i m i e n t o :   n u m b e r   |   n u l l ; 
     e f e c t o _ p r e c i o :   n u m b e r   |   n u l l ; 
     c a l c u l a b l e :   b o o l e a n ; 
 } 
 
 e x p o r t   a s y n c   f u n c t i o n   f e t c h A n a l i s i s M a t e r i a l e s ( f e c h a I n i c i o :   s t r i n g ,   f e c h a F i n :   s t r i n g ) :   P r o m i s e < {   d e t a l l e :   L i n e a M a t e r i a l [ ] ,   t o t a l :   n u m b e r   } >   { 
     c o n s t   r e s   =   a w a i t   f e t c h ( \ / a p i / a n a l i s i s _ m a t e r i a l e s ? f e c h a _ i n i c i o = \ & f e c h a _ f i n = \ \ ) ; 
     i f   ( ! r e s . o k )   t h r o w   n e w   E r r o r ( \ E r r o r   \ \ ) ; 
     c o n s t   d a t a   =   a w a i t   r e s . j s o n ( ) ; 
     r e t u r n   { 
         d e t a l l e :   d a t a . d e t a l l e   | |   [ ] , 
         t o t a l :   d a t a . t o t a l   | |   0 , 
     } ; 
 } 
  
 