// Datos mock de KPIs — serán reemplazados por datos reales de Google Sheets en fases siguientes

export type AlertaColor = 'verde' | 'amarillo' | 'rojo';

export interface FilaGrid {
  izq: { label: string; valor: string };
  der: { label: string; valor: string };
}

export interface KPI {
  id: string;
  nombre: string;
  area: string;
  valor: number | string;
  valorFormateado: string;
  meta?: string;
  subtitulo?: string;
  subtexto?: string;
  filas?: FilaGrid[];
  alerta: AlertaColor;
  descripcionAlerta: string;
}

// Umbrales definidos según documento_maestro.md
// Verde = bueno, Amarillo = precaución, Rojo = alerta crítica

function alertaVentasMeta(pct: number): AlertaColor {
  if (pct >= 90) return 'verde';
  if (pct >= 80) return 'amarillo';
  return 'rojo';
}

function alertaMargenBruto(pct: number): AlertaColor {
  if (pct >= 35) return 'verde';
  if (pct >= 25) return 'amarillo';
  return 'rojo';
}

function alertaCarteraVencida(valor: number): AlertaColor {
  if (valor < 30_000_000) return 'verde';
  if (valor <= 50_000_000) return 'amarillo';
  return 'rojo';
}

function alertaFlujoCaja(valor: number): AlertaColor {
  if (valor > 5_000_000) return 'verde';
  if (valor >= 0) return 'amarillo';
  return 'rojo';
}

function alertaCierreMensual(pct: number): AlertaColor {
  // Día 23 del mes — ya pasó el día 7, por lo tanto 100% es lo esperado
  if (pct >= 100) return 'verde';
  if (pct >= 60) return 'amarillo';
  return 'rojo';
}

function alertaEficienciaProduccion(pct: number): AlertaColor {
  if (pct >= 90) return 'verde';
  if (pct >= 85) return 'amarillo';
  return 'rojo';
}

function alertaRotacionPersonal(pct: number): AlertaColor {
  if (pct <= 3) return 'verde';
  if (pct <= 5) return 'amarillo';
  return 'rojo';
}

// ── Valores mock ──────────────────────────────────────────────────────────────
const ventasMock = 87;         // % de meta alcanzado
const margenMock = 28;         // % margen bruto
const carteraMock = 62_400_000; // COP cartera vencida
const flujoCajaMock = 15_230_000; // COP disponible
const cierreMock = 40;         // % informes aprobados (2 de 5)
const eficienciaMock = 91;     // % eficiencia máquinas
const rotacionMock = 6.2;      // % rotación mensual

export const kpis: KPI[] = [
  {
    id: 'ventas-meta',
    nombre: 'Ventas del mes vs meta',
    area: 'Ventas',
    valor: ventasMock,
    valorFormateado: `${ventasMock}%`,
    meta: 'Meta: ≥ 90%',
    alerta: alertaVentasMeta(ventasMock),
    descripcionAlerta: ventasMock >= 90 ? 'En meta' : ventasMock >= 80 ? 'Cerca de la meta' : 'Por debajo de la meta',
  },
  {
    id: 'margen-bruto',
    nombre: 'Margen bruto',
    area: 'Finanzas',
    valor: margenMock,
    valorFormateado: `${margenMock}%`,
    meta: 'Meta: ≥ 35%',
    alerta: alertaMargenBruto(margenMock),
    descripcionAlerta: margenMock >= 35 ? 'Margen saludable' : margenMock >= 25 ? 'Margen ajustado' : 'Margen crítico',
  },
  {
    id: 'cartera-vencida',
    nombre: 'Cartera vencida',
    area: 'Cartera',
    valor: carteraMock,
    valorFormateado: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(carteraMock),
    meta: 'Umbral: < $30M',
    alerta: alertaCarteraVencida(carteraMock),
    descripcionAlerta: carteraMock < 30_000_000 ? 'Cartera controlada' : carteraMock <= 50_000_000 ? 'Cartera en riesgo' : 'Cartera crítica',
  },
  {
    id: 'flujo-caja',
    nombre: 'Flujo de caja disponible',
    area: 'Finanzas',
    valor: flujoCajaMock,
    valorFormateado: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(flujoCajaMock),
    meta: 'Alerta si negativo',
    alerta: alertaFlujoCaja(flujoCajaMock),
    descripcionAlerta: flujoCajaMock > 5_000_000 ? 'Flujo positivo' : flujoCajaMock >= 0 ? 'Flujo bajo' : 'Flujo negativo',
  },
  {
    id: 'cierre-mensual',
    nombre: '% Cierre mensual',
    area: 'Todas las áreas',
    valor: cierreMock,
    valorFormateado: `${cierreMock}%`,
    meta: '2 de 5 aprobados',
    alerta: alertaCierreMensual(cierreMock),
    descripcionAlerta: cierreMock >= 100 ? 'Cierre completo' : cierreMock >= 60 ? 'Cierre en progreso' : 'Cierres pendientes',
  },
  {
    id: 'eficiencia-produccion',
    nombre: 'Eficiencia producción',
    area: 'Producción',
    valor: eficienciaMock,
    valorFormateado: `${eficienciaMock}%`,
    meta: 'Meta: ≥ 90%',
    alerta: alertaEficienciaProduccion(eficienciaMock),
    descripcionAlerta: eficienciaMock >= 90 ? 'Producción óptima' : eficienciaMock >= 85 ? 'Producción aceptable' : 'Producción baja',
  },
  {
    id: 'rotacion-personal',
    nombre: 'Rotación de personal',
    area: 'Talento Humano',
    valor: rotacionMock,
    valorFormateado: `${rotacionMock}%`,
    meta: 'Alerta si > 5%',
    alerta: alertaRotacionPersonal(rotacionMock),
    descripcionAlerta: rotacionMock <= 3 ? 'Rotación normal' : rotacionMock <= 5 ? 'Rotación moderada' : 'Rotación alta',
  },
];
