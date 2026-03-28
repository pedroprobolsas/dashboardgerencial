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
  // Raw numbers para cálculos en AlertasPanel (flujo_caja)
  egresosRaw?: number;
  flujoRaw?: number;
  diasCajaDisponibles?: number;
  // Raw numbers para cálculos en AlertasPanel (cartera_vencida)
  d30Raw?: number;
  d100plusRaw?: number;
  // Raw numbers para cálculos en AlertasPanel (obligaciones_por_vencer)
  totalVencidoRaw?: number;
  d15Raw?: number;
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

export async function fetchKPIs(periodo?: string): Promise<RespuestaKPIs> {
  const url = periodo ? `/api/kpis?periodo=${periodo}` : '/api/kpis';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} al leer KPIs`);
  return res.json();
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
