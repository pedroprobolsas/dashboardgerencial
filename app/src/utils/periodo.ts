// Utilidades de período (YYYY-MM) calculadas siempre en la zona horaria del negocio.
export const ZONA_HORARIA_NEGOCIO = 'America/Bogota';

function obtenerAnioMesEnZonaNegocio(fechaReferencia: Date): { anio: number; mes: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(fechaReferencia);
  const anio = Number(partes.find(p => p.type === 'year')?.value);
  const mes = Number(partes.find(p => p.type === 'month')?.value);
  return { anio, mes };
}

/** Último mes completo (el anterior al mes en curso en Bogotá), formato YYYY-MM. */
export function obtenerUltimoMesCompleto(fechaReferencia: Date = new Date()): string {
  const { anio, mes } = obtenerAnioMesEnZonaNegocio(fechaReferencia);
  const esEnero = mes === 1;
  const mesAnterior = esEnero ? 12 : mes - 1;
  const anioMesAnterior = esEnero ? anio - 1 : anio;
  return `${anioMesAnterior}-${String(mesAnterior).padStart(2, '0')}`;
}
