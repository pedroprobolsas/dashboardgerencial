import { Fragment, useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import {
  fetchCarteraFechas,
  fetchCarteraResumen,
  fetchCarteraClientes,
  fetchCarteraDocumentos,
  fetchCarteraTendencia,
  fetchCarteraCambios,
  type CarteraResumenResponse,
  type CarteraClienteItem,
  type CarteraDocumentoItem,
  type CarteraTendenciaItem,
  type CarteraCambiosResponse,
  type CarteraAntiguedadItem,
} from '../../services/api';
import { exportarFilasAExcel } from '../../utils/excelExport';

const fmtCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const fmtNum = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
});

type TabKey = 'resumen' | 'cambios' | 'tendencia';
type SortDir = 'asc' | 'desc';
type ClienteSortKey =
  | 'nombre_cliente'
  | 'facturas_cantidad'
  | 'facturas_saldo'
  | 'vencido'
  | 'mora_maxima'
  | 'anticipos_saldo'
  | 'neto';
type DocSortKey =
  | 'tipo'
  | 'nit_cliente'
  | 'nombre_cliente'
  | 'nro_factura'
  | 'fecha_factura'
  | 'fecha_vencimiento'
  | 'antiguedad_dias'
  | 'valor_total'
  | 'saldo'
  | 'vendedor';

function formatFechaTexto(fecha: string | null | undefined): string {
  return fecha && fecha.trim() ? fecha : '—';
}

function formatHoraColombia(syncFecha: string | null | undefined, horaFoto: string | null | undefined): string {
  if (syncFecha) {
    const dt = new Date(syncFecha);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  }
  return horaFoto || '';
}

function renderMontoConAnticipo(tipo: 'factura' | 'anticipo', monto: number) {
  if (tipo === 'anticipo') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-teal-700 tabular-nums">{fmtCOP.format(Math.abs(monto))}</span>
        <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-semibold uppercase">
          anticipo
        </span>
      </span>
    );
  }
  return <span className="font-semibold text-slate-800 tabular-nums">{fmtCOP.format(monto)}</span>;
}

function AntiguedadBloque({
  titulo,
  subtitulo,
  items,
  esAnticipo = false,
}: {
  titulo: string;
  subtitulo: string;
  items: CarteraAntiguedadItem[];
  esAnticipo?: boolean;
}) {
  const totalAbs = items.reduce((acc, it) => acc + Math.abs(it.saldo), 0);
  const maxAbs = Math.max(...items.map((it) => Math.abs(it.saldo)), 0);

  const getBarColor = (key: string) => {
    if (esAnticipo) {
      if (key === '0_30') return 'bg-teal-500';
      if (key === '31_90') return 'bg-cyan-500';
      if (key === '91_180') return 'bg-amber-400';
      if (key === '181_365') return 'bg-orange-500';
      return 'bg-red-500';
    }
    if (key === 'por_vencer') return 'bg-emerald-500';
    if (key === 'vence_hoy') return 'bg-sky-500';
    if (key === '1_30') return 'bg-amber-400';
    if (key === '31_60') return 'bg-orange-400';
    if (key === '61_90') return 'bg-orange-600';
    if (key === '91_180') return 'bg-red-500';
    return 'bg-rose-700';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitulo}</p>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const valorAbs = Math.abs(item.saldo);
          const pctBarra = maxAbs > 0 ? Math.max((valorAbs / maxAbs) * 100, valorAbs > 0 ? 3 : 0) : 0;
          const pctTotal = totalAbs > 0 ? (valorAbs / totalAbs) * 100 : 0;
          return (
            <div key={item.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">
                  {item.rango}{' '}
                  <span className="text-slate-400 font-normal">({fmtNum.format(item.cantidad)})</span>
                </span>
                <div className="flex items-center gap-2">
                  {esAnticipo ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="font-semibold text-teal-700 tabular-nums">{fmtCOP.format(valorAbs)}</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 font-semibold uppercase">
                        anticipo
                      </span>
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-800 tabular-nums">{fmtCOP.format(valorAbs)}</span>
                  )}
                  <span className="text-[11px] text-slate-400 w-11 text-right tabular-nums">
                    {pctTotal.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getBarColor(item.key)}`}
                  style={{ width: `${pctBarra}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TendenciaSvg({ serie }: { serie: CarteraTendenciaItem[] }) {
  if (serie.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        No hay snapshots históricos registrados en el rango seleccionado.
      </div>
    );
  }

  const width = 920;
  const height = 280;
  const padLeft = 86;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const valores = serie.flatMap((d) => [
    d.facturas_saldo,
    d.vencido,
    Math.abs(d.anticipos_saldo),
  ]);
  const maxVal = Math.max(...valores, 1);

  const getX = (idx: number) =>
    serie.length === 1 ? padLeft + plotW / 2 : padLeft + (idx / (serie.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - (Math.max(val, 0) / maxVal) * plotH;

  const buildPath = (extractor: (d: CarteraTendenciaItem) => number) =>
    serie
      .map((d, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(extractor(d)).toFixed(1)}`)
      .join(' ');

  const ticksY = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(serie.length / 8));

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex flex-wrap items-center gap-5 mb-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className="w-3 h-1 rounded bg-indigo-600 inline-block" /> Facturas abiertas
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className="w-3 h-1 rounded bg-red-500 inline-block" /> Vencido
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className="w-3 h-1 rounded bg-teal-500 inline-block" /> Anticipos sin aplicar (magnitud)
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px] h-72">
        {ticksY.map((t) => {
          const val = maxVal * t;
          const y = getY(val);
          return (
            <g key={t}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                {fmtCOP.format(val)}
              </text>
            </g>
          );
        })}

        <path d={buildPath((d) => d.facturas_saldo)} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
        <path d={buildPath((d) => d.vencido)} fill="none" stroke="#ef4444" strokeWidth="2.5" />
        <path d={buildPath((d) => Math.abs(d.anticipos_saldo))} fill="none" stroke="#14b8a6" strokeWidth="2.5" />

        {serie.map((d, idx) => {
          const x = getX(idx);
          const showLabel = idx % labelStep === 0 || idx === serie.length - 1;
          return (
            <g key={d.fecha}>
              <circle cx={x} cy={getY(d.facturas_saldo)} r="3.5" fill="#4f46e5">
                <title>{`${d.fecha} · Facturas: ${fmtCOP.format(d.facturas_saldo)}`}</title>
              </circle>
              <circle cx={x} cy={getY(d.vencido)} r="3.5" fill="#ef4444">
                <title>{`${d.fecha} · Vencido: ${fmtCOP.format(d.vencido)}`}</title>
              </circle>
              <circle cx={x} cy={getY(Math.abs(d.anticipos_saldo))} r="3.5" fill="#14b8a6">
                <title>{`${d.fecha} · Anticipos: ${fmtCOP.format(Math.abs(d.anticipos_saldo))}`}</title>
              </circle>
              {showLabel && (
                <text x={x} y={height - 14} textAnchor="middle" className="fill-slate-500 text-[10px]">
                  {d.fecha}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function CarteraClientes() {
  const [tab, setTab] = useState<TabKey>('resumen');
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(''); // '' = foto actual
  const [fechasDisponibles, setFechasDisponibles] = useState<string[]>([]);
  const [fechaActual, setFechaActual] = useState<string | null>(null);

  const [resumen, setResumen] = useState<CarteraResumenResponse | null>(null);
  const [clientes, setClientes] = useState<CarteraClienteItem[]>([]);
  const [documentos, setDocumentos] = useState<CarteraDocumentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado Clientes
  const [soloCrucePendiente, setSoloCrucePendiente] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteSortKey, setClienteSortKey] = useState<ClienteSortKey>('neto');
  const [clienteSortDir, setClienteSortDir] = useState<SortDir>('desc');
  const [expandedClientes, setExpandedClientes] = useState<Record<string, boolean>>({});

  // Estado Documentos
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'factura' | 'anticipo'>('todos');
  const [filtroAsesor, setFiltroAsesor] = useState<string>('todos');
  const [filtroTexto, setFiltroTexto] = useState<string>('');
  const [filtroMora, setFiltroMora] = useState<'todas' | 'vencidas' | 'mas_30' | 'mas_90'>('todas');
  const [soloAnticiposMas90, setSoloAnticiposMas90] = useState(false);
  const [docSortKey, setDocSortKey] = useState<DocSortKey>('saldo');
  const [docSortDir, setDocSortDir] = useState<SortDir>('desc');

  // Estado Cambios
  const [cambiosDesde, setCambiosDesde] = useState<string>('');
  const [cambiosHasta, setCambiosHasta] = useState<string>('');
  const [cambiosData, setCambiosData] = useState<CarteraCambiosResponse | null>(null);
  const [loadingCambios, setLoadingCambios] = useState(false);
  const [errorCambios, setErrorCambios] = useState<string | null>(null);

  // Estado Tendencia
  const [tendDesde, setTendDesde] = useState<string>('');
  const [tendHasta, setTendHasta] = useState<string>('');
  const [tendencia, setTendencia] = useState<CarteraTendenciaItem[]>([]);
  const [loadingTendencia, setLoadingTendencia] = useState(false);
  const [errorTendencia, setErrorTendencia] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);

  // Cargar fechas históricas al montar
  useEffect(() => {
    let ignore = false;
    fetchCarteraFechas()
      .then((resp) => {
        if (ignore) return;
        setFechasDisponibles(resp.fechas || []);
        setFechaActual(resp.fecha_actual || null);
      })
      .catch((err) => {
        console.error('Error cargando fechas cartera:', err);
      });
    return () => {
      ignore = true;
    };
  }, [refreshTick]);

  // Cargar resumen, clientes y documentos para la foto seleccionada
  useEffect(() => {
    let ignore = false;
    async function loadFoto() {
      setLoading(true);
      setError(null);
      try {
        const param = fechaSeleccionada || undefined;
        const [resResp, cliResp, docResp] = await Promise.all([
          fetchCarteraResumen(param),
          fetchCarteraClientes(param),
          fetchCarteraDocumentos(param),
        ]);
        if (ignore) return;
        setResumen(resResp);
        setClientes(cliResp.clientes || []);
        setDocumentos(docResp.documentos || []);
        setExpandedClientes({});
      } catch (err: unknown) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Error cargando cartera de clientes');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadFoto();
    return () => {
      ignore = true;
    };
  }, [fechaSeleccionada, refreshTick]);

  // Cargar cambios cuando entra a la pestaña Cambios o cambian fechas
  useEffect(() => {
    if (tab !== 'cambios') return;
    let ignore = false;
    async function loadCambios() {
      setLoadingCambios(true);
      setErrorCambios(null);
      try {
        const resp = await fetchCarteraCambios(cambiosDesde || undefined, cambiosHasta || undefined);
        if (ignore) return;
        setCambiosData(resp);
        if (!cambiosDesde && resp.desde) setCambiosDesde(resp.desde);
        if (!cambiosHasta && resp.hasta) setCambiosHasta(resp.hasta);
      } catch (err: unknown) {
        if (!ignore) setErrorCambios(err instanceof Error ? err.message : 'Error comparando fotos');
      } finally {
        if (!ignore) setLoadingCambios(false);
      }
    }
    loadCambios();
    return () => {
      ignore = true;
    };
  }, [tab, cambiosDesde, cambiosHasta, refreshTick]);

  // Cargar tendencia cuando entra a la pestaña Tendencia o cambia rango
  useEffect(() => {
    if (tab !== 'tendencia') return;
    let ignore = false;
    async function loadTendencia() {
      setLoadingTendencia(true);
      setErrorTendencia(null);
      try {
        const resp = await fetchCarteraTendencia(tendDesde || undefined, tendHasta || undefined);
        if (!ignore) setTendencia(resp.serie || []);
      } catch (err: unknown) {
        if (!ignore) setErrorTendencia(err instanceof Error ? err.message : 'Error cargando tendencia');
      } finally {
        if (!ignore) setLoadingTendencia(false);
      }
    }
    loadTendencia();
    return () => {
      ignore = true;
    };
  }, [tab, tendDesde, tendHasta, refreshTick]);

  // Fechas históricas excluyendo la fecha actual para no duplicar en el selector
  const fechasHistoricasSinActual = useMemo(() => {
    if (!fechaActual) return fechasDisponibles;
    return fechasDisponibles.filter((f) => f !== fechaActual);
  }, [fechasDisponibles, fechaActual]);

  const asesoresDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const d of documentos) {
      set.add(d.vendedor || 'SIN ASESOR');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [documentos]);

  const documentosPorCliente = useMemo(() => {
    const mapa = new Map<string, CarteraDocumentoItem[]>();
    for (const doc of documentos) {
      const key = `${doc.nit_cliente}||${doc.nombre_cliente}`;
      const arr = mapa.get(key);
      if (arr) arr.push(doc);
      else mapa.set(key, [doc]);
    }
    return mapa;
  }, [documentos]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase();
    const list = clientes.filter((c) => {
      if (soloCrucePendiente && !c.cruce_pendiente) return false;
      if (q) {
        const matchNit = (c.nit_cliente || '').toLowerCase().includes(q);
        const matchNom = (c.nombre_cliente || '').toLowerCase().includes(q);
        if (!matchNit && !matchNom) return false;
      }
      return true;
    });

    const dir = clienteSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (clienteSortKey === 'nombre_cliente') {
        return a.nombre_cliente.localeCompare(b.nombre_cliente, 'es') * dir;
      }
      const va = a[clienteSortKey] ?? -999999999;
      const vb = b[clienteSortKey] ?? -999999999;
      return (Number(va) - Number(vb)) * dir;
    });
  }, [clientes, soloCrucePendiente, clienteSearch, clienteSortKey, clienteSortDir]);

  const documentosFiltrados = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    const list = documentos.filter((d) => {
      if (soloAnticiposMas90) {
        if (d.tipo !== 'anticipo' || d.antiguedad_dias <= 90) return false;
      }
      if (filtroTipo !== 'todos' && d.tipo !== filtroTipo) return false;
      const asesorLabel = d.vendedor || 'SIN ASESOR';
      if (filtroAsesor !== 'todos' && asesorLabel !== filtroAsesor) return false;
      if (filtroMora !== 'todas') {
        if (d.tipo !== 'factura') return false;
        if (filtroMora === 'vencidas' && d.dias_vencido <= 0) return false;
        if (filtroMora === 'mas_30' && d.dias_vencido <= 30) return false;
        if (filtroMora === 'mas_90' && d.dias_vencido <= 90) return false;
      }
      if (q) {
        const matchNom = (d.nombre_cliente || '').toLowerCase().includes(q);
        const matchNit = (d.nit_cliente || '').toLowerCase().includes(q);
        const matchDoc = (d.nro_factura || '').toLowerCase().includes(q);
        if (!matchNom && !matchNit && !matchDoc) return false;
      }
      return true;
    });

    const dir = docSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (docSortKey) {
        case 'tipo':
          return a.tipo.localeCompare(b.tipo) * dir;
        case 'nit_cliente':
          return (a.nit_cliente || '').localeCompare(b.nit_cliente || '') * dir;
        case 'nombre_cliente':
          return (a.nombre_cliente || '').localeCompare(b.nombre_cliente || '', 'es') * dir;
        case 'nro_factura':
          return (a.nro_factura || '').localeCompare(b.nro_factura || '') * dir;
        case 'fecha_factura':
          return (a.fecha_factura || '').localeCompare(b.fecha_factura || '') * dir;
        case 'fecha_vencimiento':
          return (a.fecha_vencimiento || '').localeCompare(b.fecha_vencimiento || '') * dir;
        case 'vendedor':
          return (a.vendedor || 'SIN ASESOR').localeCompare(b.vendedor || 'SIN ASESOR', 'es') * dir;
        case 'antiguedad_dias':
          return (a.antiguedad_dias - b.antiguedad_dias) * dir;
        case 'valor_total':
          return (a.valor_total - b.valor_total) * dir;
        case 'saldo':
        default:
          return (a.saldo - b.saldo) * dir;
      }
    });
  }, [
    documentos,
    filtroTipo,
    filtroAsesor,
    filtroTexto,
    filtroMora,
    soloAnticiposMas90,
    docSortKey,
    docSortDir,
  ]);

  const totalesDocsFiltrados = useMemo(() => {
    let facturas = 0;
    let anticipos = 0;
    let neto = 0;
    for (const d of documentosFiltrados) {
      if (d.tipo === 'factura') facturas += d.saldo;
      else anticipos += d.saldo;
      neto += d.saldo;
    }
    return { facturas, anticipos, neto };
  }, [documentosFiltrados]);

  const toggleClienteSort = (key: ClienteSortKey) => {
    if (clienteSortKey === key) setClienteSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setClienteSortKey(key);
      setClienteSortDir(key === 'nombre_cliente' ? 'asc' : 'desc');
    }
  };

  const toggleDocSort = (key: DocSortKey) => {
    if (docSortKey === key) setDocSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setDocSortKey(key);
      setDocSortDir(['tipo', 'nit_cliente', 'nombre_cliente', 'nro_factura', 'vendedor'].includes(key) ? 'asc' : 'desc');
    }
  };

  const handleExportExcel = () => {
    const fechaTag = resumen?.fecha_foto || 'actual';
    exportarFilasAExcel<CarteraDocumentoItem>({
      nombreArchivo: `cartera-clientes-${fechaTag}.xlsx`,
      nombreHoja: 'Documentos',
      filas: documentosFiltrados,
      columnas: [
        { encabezado: 'Tipo', obtenerValor: (d) => (d.tipo === 'anticipo' ? 'Anticipo' : 'Factura'), anchoCaracteres: 12 },
        { encabezado: 'NIT', obtenerValor: (d) => d.nit_cliente, anchoCaracteres: 16 },
        { encabezado: 'Cliente', obtenerValor: (d) => d.nombre_cliente, anchoCaracteres: 36 },
        { encabezado: 'Documento', obtenerValor: (d) => d.nro_factura, anchoCaracteres: 16 },
        { encabezado: 'Fecha', obtenerValor: (d) => d.fecha_factura || '', anchoCaracteres: 13 },
        { encabezado: 'Vence', obtenerValor: (d) => d.fecha_vencimiento || '', anchoCaracteres: 13 },
        { encabezado: 'Mora / Antigüedad (días)', obtenerValor: (d) => d.antiguedad_dias, anchoCaracteres: 22 },
        { encabezado: 'Valor', obtenerValor: (d) => Math.round(d.valor_total), anchoCaracteres: 16 },
        {
          encabezado: 'Saldo',
          obtenerValor: (d) => (d.tipo === 'anticipo' ? Math.round(Math.abs(d.saldo)) : Math.round(d.saldo)),
          anchoCaracteres: 16,
        },
        { encabezado: 'Asesor', obtenerValor: (d) => d.vendedor || 'SIN ASESOR', anchoCaracteres: 22 },
      ],
    });
  };

  const fechaTitulo = resumen?.fecha_foto || fechaSeleccionada || fechaActual || '—';
  const horaTitulo = formatHoraColombia(resumen?.sync_fecha, resumen?.hora_foto);

  const totalesAsesor = useMemo(() => {
    if (!resumen) return { facturas: 0, saldo: 0, vencido: 0, pct_vencido: 0, saldo_mas_30: 0 };
    const facturas = resumen.por_asesor.reduce((acc, a) => acc + a.facturas, 0);
    const saldo = resumen.por_asesor.reduce((acc, a) => acc + a.saldo, 0);
    const vencido = resumen.por_asesor.reduce((acc, a) => acc + a.vencido, 0);
    const saldo_mas_30 = resumen.por_asesor.reduce((acc, a) => acc + a.saldo_mas_30, 0);
    const pct_vencido = saldo > 0 ? Number(((vencido / saldo) * 100).toFixed(1)) : 0;
    return { facturas, saldo, vencido, pct_vencido, saldo_mas_30 };
  }, [resumen]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Encabezado */}
      <header className="px-8 py-5 bg-white border-b border-slate-200 shrink-0 flex flex-wrap gap-4 justify-between items-center">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-dashboard-textMain">
              Cartera de clientes · foto del {fechaTitulo}
              {horaTitulo ? ` ${horaTitulo}` : ''}
            </h1>
            {resumen && (
              resumen.desactualizado ? (
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold uppercase tracking-wide border border-amber-200 inline-flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-500" />
                  Desactualizado
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase tracking-wide border border-emerald-200 inline-flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  Al día
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setTab('resumen')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'resumen'
                  ? 'bg-probolsas-navy text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Resumen y Detalle
            </button>
            <button
              onClick={() => setTab('cambios')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'cambios'
                  ? 'bg-probolsas-navy text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Cambios
            </button>
            <button
              onClick={() => setTab('tendencia')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'tendencia'
                  ? 'bg-probolsas-navy text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tendencia
            </button>
          </div>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-dashboard-textMuted mb-1 uppercase tracking-wider">
              Foto / Fecha de corte
            </label>
            <select
              value={fechaSeleccionada}
              onChange={(e) => setFechaSeleccionada(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-dashboard-textMain bg-slate-50 focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
            >
              <option value="">
                {fechaActual ? `Foto actual (${fechaActual})` : 'Foto actual'}
              </option>
              {fechasHistoricasSinActual.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={loading || documentosFiltrados.length === 0}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
          >
            <Download size={15} />
            Exportar a Excel
          </button>

          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Recargar vista"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-auto p-6 md:p-8 flex flex-col gap-6">
        {tab === 'resumen' && (
          <>
            {loading ? (
              <div className="p-16 text-center text-slate-500 animate-pulse">Cargando cartera de clientes...</div>
            ) : error ? (
              <div className="p-16 text-center flex flex-col items-center">
                <AlertTriangle size={36} className="text-red-400 mb-3" />
                <p className="text-red-500 font-medium text-sm mb-1">No se pudo cargar la cartera</p>
                <p className="text-xs text-slate-500">{error}</p>
              </div>
            ) : resumen ? (
              <>
                {/* Tarjetas principales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Facturas abiertas
                    </span>
                    <span className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                      {fmtCOP.format(resumen.totales.facturas_saldo)}
                    </span>
                    <span className="text-xs text-slate-500 mt-2">
                      {fmtNum.format(resumen.totales.facturas_cantidad)} facturas
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-red-200 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Vencido</span>
                    <span className="text-2xl font-bold text-red-700 mt-2 tabular-nums">
                      {fmtCOP.format(resumen.totales.vencido)}
                    </span>
                    <span className="text-xs text-red-600 mt-2">
                      {fmtNum.format(resumen.totales.vencido_cantidad)} docs ·{' '}
                      {resumen.totales.facturas_saldo > 0
                        ? `${((resumen.totales.vencido / resumen.totales.facturas_saldo) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-sky-200 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider">Vence hoy</span>
                    <span className="text-2xl font-bold text-sky-800 mt-2 tabular-nums">
                      {fmtCOP.format(resumen.totales.vence_hoy)}
                    </span>
                    <span className="text-xs text-slate-500 mt-2">
                      {fmtNum.format(resumen.totales.vence_hoy_cantidad)} facturas
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                      Por vencer
                    </span>
                    <span className="text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
                      {fmtCOP.format(resumen.totales.por_vencer)}
                    </span>
                    <span className="text-xs text-slate-500 mt-2">
                      {fmtNum.format(resumen.totales.por_vencer_cantidad)} facturas
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-teal-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                        Anticipos sin aplicar
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-semibold uppercase">
                        anticipo
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-teal-700 mt-2 tabular-nums">
                      {fmtCOP.format(Math.abs(resumen.totales.anticipos_saldo))}
                    </span>
                    <span className="text-xs text-slate-500 mt-2">
                      {fmtNum.format(resumen.totales.anticipos_cantidad)} recibos
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border-l-4 border-l-probolsas-cyan border-y border-r border-slate-200 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Neto</span>
                    <span
                      className={`text-2xl font-bold mt-2 tabular-nums ${
                        resumen.totales.neto < 0 ? 'text-teal-700' : 'text-slate-900'
                      }`}
                    >
                      {fmtCOP.format(resumen.totales.neto)}
                    </span>
                    <span className="text-xs text-slate-500 mt-2">Facturas + anticipos</span>
                  </div>
                </div>

                {/* Tarjeta SIIGO: 1305 y 2805 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                        Conciliación SIIGO vs Crisolweb
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {resumen.siigo.fecha_siigo
                          ? `Último saldo SIIGO ≤ ${resumen.fecha_foto}: ${resumen.siigo.fecha_siigo}`
                          : `No hay saldos SIIGO registrados ≤ ${resumen.fecha_foto || '—'}`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">Cuenta 1305 — Clientes</span>
                        <span className="text-[11px] text-slate-500">
                          Fecha SIIGO: {formatFechaTexto(resumen.siigo.fecha_siigo)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs mt-1">
                        <div>
                          <div className="text-slate-500">SIIGO 1305</div>
                          <div className="text-sm font-bold text-slate-800 tabular-nums">
                            {fmtCOP.format(resumen.siigo.clientes_1305)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Crisolweb Facturas</div>
                          <div className="text-sm font-bold text-slate-800 tabular-nums">
                            {fmtCOP.format(resumen.totales.facturas_saldo)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Diferencia</div>
                          <div
                            className={`text-sm font-bold tabular-nums ${
                              Math.abs(resumen.siigo.diferencia_facturas) > 1000
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {fmtCOP.format(resumen.siigo.diferencia_facturas)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Cuenta 2805 — Anticipos de clientes
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Fecha SIIGO: {formatFechaTexto(resumen.siigo.fecha_siigo)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs mt-1">
                        <div>
                          <div className="text-slate-500">SIIGO 2805</div>
                          <div className="text-sm font-bold text-teal-700 tabular-nums">
                            {fmtCOP.format(Math.abs(resumen.siigo.anticipos_2805))}
                          </div>
                          <span className="text-[10px] text-teal-600 font-semibold uppercase">anticipo</span>
                        </div>
                        <div>
                          <div className="text-slate-500">Crisolweb Anticipos</div>
                          <div className="text-sm font-bold text-teal-700 tabular-nums">
                            {fmtCOP.format(Math.abs(resumen.totales.anticipos_saldo))}
                          </div>
                          <span className="text-[10px] text-teal-600 font-semibold uppercase">anticipo</span>
                        </div>
                        <div>
                          <div className="text-slate-500">Diferencia</div>
                          <div
                            className={`text-sm font-bold tabular-nums ${
                              Math.abs(resumen.siigo.diferencia_anticipos) > 1000
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {fmtCOP.format(resumen.siigo.diferencia_anticipos)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Barras de antigüedad */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <AntiguedadBloque
                    titulo="Antigüedad de facturas"
                    subtitulo="Clasificación por días de mora (dias_vencido)"
                    items={resumen.antiguedad_facturas}
                  />
                  <AntiguedadBloque
                    titulo="Antigüedad de anticipos"
                    subtitulo="Días transcurridos entre fecha del recibo y fecha de la foto"
                    items={resumen.antiguedad_anticipos}
                    esAnticipo
                  />
                </div>

                {/* Tabla por Asesor */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                        Cartera por Asesor (Facturas)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Incluye todas las facturas abiertas de la foto seleccionada
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Asesor</th>
                          <th className="px-5 py-3 font-semibold text-right">Facturas</th>
                          <th className="px-5 py-3 font-semibold text-right">Saldo</th>
                          <th className="px-5 py-3 font-semibold text-right">Vencido</th>
                          <th className="px-5 py-3 font-semibold text-right">% Vencido</th>
                          <th className="px-5 py-3 font-semibold text-right">Saldo &gt; 30 días</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resumen.por_asesor.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                              Sin facturas abiertas para esta foto.
                            </td>
                          </tr>
                        ) : (
                          resumen.por_asesor.map((a) => (
                            <tr key={a.asesor} className="hover:bg-slate-50">
                              <td className="px-5 py-3 font-medium text-slate-800">{a.asesor}</td>
                              <td className="px-5 py-3 text-right tabular-nums">{fmtNum.format(a.facturas)}</td>
                              <td className="px-5 py-3 text-right font-semibold text-slate-800 tabular-nums">
                                {fmtCOP.format(a.saldo)}
                              </td>
                              <td className="px-5 py-3 text-right font-semibold text-red-600 tabular-nums">
                                {fmtCOP.format(a.vencido)}
                              </td>
                              <td className="px-5 py-3 text-right tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    a.pct_vencido <= 20
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : a.pct_vencido <= 40
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-red-50 text-red-700'
                                  }`}
                                >
                                  {a.pct_vencido.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-medium text-orange-700 tabular-nums">
                                {fmtCOP.format(a.saldo_mas_30)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {resumen.por_asesor.length > 0 && (
                        <tfoot className="bg-slate-800 text-white text-xs font-bold">
                          <tr>
                            <td className="px-5 py-3">TOTAL</td>
                            <td className="px-5 py-3 text-right tabular-nums">
                              {fmtNum.format(totalesAsesor.facturas)}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                              {fmtCOP.format(totalesAsesor.saldo)}
                            </td>
                            <td className="px-5 py-3 text-right text-red-300 tabular-nums">
                              {fmtCOP.format(totalesAsesor.vencido)}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                              {totalesAsesor.pct_vencido.toFixed(1)}%
                            </td>
                            <td className="px-5 py-3 text-right text-amber-300 tabular-nums">
                              {fmtCOP.format(totalesAsesor.saldo_mas_30)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Tabla por Cliente (expandible y ordenable) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-3 justify-between items-center">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                        Cartera por Cliente ({fmtNum.format(clientesFiltrados.length)})
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Haz clic en una fila para desplegar los documentos del cliente
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={clienteSearch}
                          onChange={(e) => setClienteSearch(e.target.value)}
                          placeholder="Buscar NIT o cliente..."
                          className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-probolsas-cyan"
                        />
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={soloCrucePendiente}
                          onChange={(e) => setSoloCrucePendiente(e.target.checked)}
                          className="rounded border-slate-300 text-probolsas-navy focus:ring-probolsas-cyan"
                        />
                        Solo cruce pendiente
                      </label>
                    </div>
                  </div>
                  <div className="max-h-[460px] overflow-auto">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 font-semibold w-8"></th>
                          <th className="px-4 py-3 font-semibold">NIT</th>
                          <th className="px-4 py-3 font-semibold">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('nombre_cliente')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Cliente <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-right">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('facturas_cantidad')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Fact. <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-right">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('facturas_saldo')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Saldo Facturas <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-right">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('vencido')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Vencido <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-right">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('mora_maxima')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Mora Máx. <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-right">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('anticipos_saldo')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Anticipos <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-right">
                            <button
                              type="button"
                              onClick={() => toggleClienteSort('neto')}
                              className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                            >
                              Neto <ArrowUpDown size={12} />
                            </button>
                          </th>
                          <th className="px-4 py-3 font-semibold text-center">Cruce</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientesFiltrados.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-5 py-8 text-center text-slate-400">
                              No se encontraron clientes con los filtros actuales.
                            </td>
                          </tr>
                        ) : (
                          clientesFiltrados.map((c) => {
                            const rowKey = `${c.nit_cliente}||${c.nombre_cliente}`;
                            const isExpanded = Boolean(expandedClientes[rowKey]);
                            const docsCliente = documentosPorCliente.get(rowKey) || [];
                            return (
                              <Fragment key={rowKey}>
                                <tr
                                  onClick={() =>
                                    setExpandedClientes((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }))
                                  }
                                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                                >
                                  <td className="px-4 py-2.5 text-slate-400">
                                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{c.nit_cliente}</td>
                                  <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[260px] truncate" title={c.nombre_cliente}>
                                    {c.nombre_cliente}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums">
                                    {fmtNum.format(c.facturas_cantidad)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-medium text-slate-800 tabular-nums">
                                    {fmtCOP.format(c.facturas_saldo)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums">
                                    {fmtCOP.format(c.vencido)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums">
                                    {c.mora_maxima !== null ? (
                                      <span
                                        className={
                                          c.mora_maxima > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'
                                        }
                                      >
                                        {c.mora_maxima} d
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    {c.anticipos_cantidad > 0 ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span className="font-medium text-teal-700 tabular-nums">
                                          {fmtCOP.format(Math.abs(c.anticipos_saldo))}
                                        </span>
                                        <span className="text-[10px] text-slate-400">({c.anticipos_cantidad})</span>
                                        <span className="px-1 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                                          anticipo
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td
                                    className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                                      c.neto < 0 ? 'text-teal-700' : 'text-slate-900'
                                    }`}
                                  >
                                    {fmtCOP.format(c.neto)}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {c.cruce_pendiente ? (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                        Cruce pendiente
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-slate-50/70">
                                    <td colSpan={10} className="px-8 py-3">
                                      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
                                        <table className="w-full text-left text-xs text-slate-600">
                                          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase">
                                            <tr>
                                              <th className="px-3 py-2 font-semibold">Tipo</th>
                                              <th className="px-3 py-2 font-semibold">Documento</th>
                                              <th className="px-3 py-2 font-semibold">Fecha</th>
                                              <th className="px-3 py-2 font-semibold">Vence</th>
                                              <th className="px-3 py-2 font-semibold text-right">Mora / Antig.</th>
                                              <th className="px-3 py-2 font-semibold text-right">Valor</th>
                                              <th className="px-3 py-2 font-semibold text-right">Saldo</th>
                                              <th className="px-3 py-2 font-semibold">Asesor</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {docsCliente.map((doc) => (
                                              <tr key={`${doc.tipo}-${doc.nro_factura}`}>
                                                <td className="px-3 py-2">
                                                  <span
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                                      doc.tipo === 'anticipo'
                                                        ? 'bg-teal-50 text-teal-700'
                                                        : 'bg-indigo-50 text-indigo-700'
                                                    }`}
                                                  >
                                                    {doc.tipo}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 font-medium text-slate-800">{doc.nro_factura}</td>
                                                <td className="px-3 py-2">{formatFechaTexto(doc.fecha_factura)}</td>
                                                <td className="px-3 py-2">{formatFechaTexto(doc.fecha_vencimiento)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                  {doc.antiguedad_dias} d
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                  {fmtCOP.format(doc.valor_total)}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                  {renderMontoConAnticipo(doc.tipo, doc.saldo)}
                                                </td>
                                                <td className="px-3 py-2">{doc.vendedor || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabla de Documentos */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                          Detalle de Documentos ({fmtNum.format(documentosFiltrados.length)})
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Total filtrado — Facturas:{' '}
                          <strong className="text-slate-700">{fmtCOP.format(totalesDocsFiltrados.facturas)}</strong> ·
                          Anticipos:{' '}
                          <strong className="text-teal-700">
                            {fmtCOP.format(Math.abs(totalesDocsFiltrados.anticipos))}
                          </strong>{' '}
                          <span className="text-[10px] uppercase text-teal-700 font-semibold">(anticipo)</span> · Neto:{' '}
                          <strong className="text-slate-900">{fmtCOP.format(totalesDocsFiltrados.neto)}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Filtros documentos */}
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Tipo</label>
                        <select
                          value={filtroTipo}
                          onChange={(e) => setFiltroTipo(e.target.value as 'todos' | 'factura' | 'anticipo')}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        >
                          <option value="todos">Todos</option>
                          <option value="factura">Facturas</option>
                          <option value="anticipo">Anticipos</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Asesor</label>
                        <select
                          value={filtroAsesor}
                          onChange={(e) => setFiltroAsesor(e.target.value)}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white min-w-[160px]"
                        >
                          <option value="todos">Todos los asesores</option>
                          {asesoresDisponibles.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Mora facturas</label>
                        <select
                          value={filtroMora}
                          onChange={(e) =>
                            setFiltroMora(e.target.value as 'todas' | 'vencidas' | 'mas_30' | 'mas_90')
                          }
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        >
                          <option value="todas">Todas</option>
                          <option value="vencidas">Vencidas (&gt; 0 d)</option>
                          <option value="mas_30">Más de 30 días</option>
                          <option value="mas_90">Más de 90 días</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">
                          Buscar cliente, NIT o documento
                        </label>
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={filtroTexto}
                            onChange={(e) => setFiltroTexto(e.target.value)}
                            placeholder="Ej: 900123, Probolsas, FE-1020..."
                            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                          />
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={soloAnticiposMas90}
                          onChange={(e) => setSoloAnticiposMas90(e.target.checked)}
                          className="rounded border-slate-300 text-probolsas-navy focus:ring-probolsas-cyan"
                        />
                        Anticipos &gt; 90 días
                      </label>
                    </div>
                  </div>

                  <div className="max-h-[540px] overflow-auto">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                      <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase sticky top-0 z-10">
                        <tr>
                          {(
                            [
                              { key: 'tipo', label: 'Tipo', align: 'left' },
                              { key: 'nit_cliente', label: 'NIT', align: 'left' },
                              { key: 'nombre_cliente', label: 'Cliente', align: 'left' },
                              { key: 'nro_factura', label: 'Documento', align: 'left' },
                              { key: 'fecha_factura', label: 'Fecha', align: 'left' },
                              { key: 'fecha_vencimiento', label: 'Vence', align: 'left' },
                              { key: 'antiguedad_dias', label: 'Mora/antigüedad', align: 'right' },
                              { key: 'valor_total', label: 'Valor', align: 'right' },
                              { key: 'saldo', label: 'Saldo', align: 'right' },
                              { key: 'vendedor', label: 'Asesor', align: 'left' },
                            ] as { key: DocSortKey; label: string; align: 'left' | 'right' }[]
                          ).map((col) => (
                            <th
                              key={col.key}
                              className={`px-4 py-3 font-semibold ${col.align === 'right' ? 'text-right' : ''}`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleDocSort(col.key)}
                                className="inline-flex items-center gap-1 hover:text-slate-800 uppercase"
                              >
                                {col.label} <ArrowUpDown size={11} />
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {documentosFiltrados.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-5 py-8 text-center text-slate-400">
                              No hay documentos que coincidan con los filtros aplicados.
                            </td>
                          </tr>
                        ) : (
                          documentosFiltrados.map((d) => (
                            <tr key={`${d.tipo}-${d.nro_factura}`} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                                    d.tipo === 'anticipo'
                                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  }`}
                                >
                                  {d.tipo}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-mono">{d.nit_cliente}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[240px] truncate" title={d.nombre_cliente}>
                                {d.nombre_cliente}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-slate-700">{d.nro_factura}</td>
                              <td className="px-4 py-2.5 text-xs">{formatFechaTexto(d.fecha_factura)}</td>
                              <td className="px-4 py-2.5 text-xs">{formatFechaTexto(d.fecha_vencimiento)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                <span
                                  className={
                                    d.tipo === 'factura' && d.dias_vencido > 0
                                      ? 'text-red-600 font-semibold'
                                      : d.tipo === 'anticipo' && d.antiguedad_dias > 90
                                      ? 'text-amber-700 font-semibold'
                                      : 'text-slate-600'
                                  }
                                >
                                  {d.antiguedad_dias} d
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                                {fmtCOP.format(d.valor_total)}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {renderMontoConAnticipo(d.tipo, d.saldo)}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-600">{d.vendedor || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}

        {/* Pestaña Cambios */}
        {tab === 'cambios' && (
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-wrap gap-4 items-end justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Comparación entre dos fotos del histórico
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Compara documentos por tipo y número entre la fecha inicial y la fecha final
                </p>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Desde</label>
                  <select
                    value={cambiosDesde}
                    onChange={(e) => setCambiosDesde(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50"
                  >
                    {fechasDisponibles.length === 0 && <option value="">Sin fechas</option>}
                    {fechasDisponibles.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Hasta</label>
                  <select
                    value={cambiosHasta}
                    onChange={(e) => setCambiosHasta(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50"
                  >
                    {fechasDisponibles.length === 0 && <option value="">Sin fechas</option>}
                    {fechasDisponibles.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {loadingCambios ? (
              <div className="p-12 text-center text-slate-500 animate-pulse">Comparando fotografías...</div>
            ) : errorCambios ? (
              <div className="p-12 text-center text-red-500 text-sm">{errorCambios}</div>
            ) : cambiosData ? (
              <>
                {cambiosData.mensaje && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-medium">
                    {cambiosData.mensaje}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-700 uppercase">
                        Documentos que salieron
                      </span>
                      <span className="text-xs text-slate-500">
                        {fmtNum.format(cambiosData.totales.salieron.cantidad)} docs
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-600">
                        Facturas ({fmtNum.format(cambiosData.totales.salieron.facturas.cantidad)})
                      </span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {fmtCOP.format(cambiosData.totales.salieron.facturas.saldo)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        Anticipos ({fmtNum.format(cambiosData.totales.salieron.anticipos.cantidad)})
                        <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                          anticipo
                        </span>
                      </span>
                      <span className="text-sm font-bold text-teal-700 tabular-nums">
                        {fmtCOP.format(Math.abs(cambiosData.totales.salieron.anticipos.saldo))}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-700 uppercase">
                        Documentos que entraron
                      </span>
                      <span className="text-xs text-slate-500">
                        {fmtNum.format(cambiosData.totales.entraron.cantidad)} docs
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-600">
                        Facturas ({fmtNum.format(cambiosData.totales.entraron.facturas.cantidad)})
                      </span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {fmtCOP.format(cambiosData.totales.entraron.facturas.saldo)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        Anticipos ({fmtNum.format(cambiosData.totales.entraron.anticipos.cantidad)})
                        <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                          anticipo
                        </span>
                      </span>
                      <span className="text-sm font-bold text-teal-700 tabular-nums">
                        {fmtCOP.format(Math.abs(cambiosData.totales.entraron.anticipos.saldo))}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-700 uppercase">
                        Cambiaron (saldo o datos)
                      </span>
                      <span className="text-xs text-slate-500">
                        {fmtNum.format(cambiosData.totales.cambiaron_saldo.cantidad)} docs
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-600">
                        Facturas ({fmtNum.format(cambiosData.totales.cambiaron_saldo.facturas.cantidad)})
                      </span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        Dif: {fmtCOP.format(cambiosData.totales.cambiaron_saldo.facturas.diferencia)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        Anticipos ({fmtNum.format(cambiosData.totales.cambiaron_saldo.anticipos.cantidad)})
                        <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                          anticipo
                        </span>
                      </span>
                      <span className="text-sm font-bold text-teal-700 tabular-nums">
                        Dif:{' '}
                        {fmtCOP.format(
                          Math.abs(cambiosData.totales.cambiaron_saldo.anticipos.saldo_despues) -
                            Math.abs(cambiosData.totales.cambiaron_saldo.anticipos.saldo_antes)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Salieron */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-3 justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800">
                      Salieron ({fmtNum.format(cambiosData.totales.salieron.cantidad)})
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="font-semibold text-slate-700 tabular-nums">
                        Facturas ({fmtNum.format(cambiosData.totales.salieron.facturas.cantidad)}):{' '}
                        <strong className="text-emerald-700">
                          {fmtCOP.format(cambiosData.totales.salieron.facturas.saldo)}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 tabular-nums">
                        Anticipos ({fmtNum.format(cambiosData.totales.salieron.anticipos.cantidad)}):{' '}
                        <strong className="text-teal-700">
                          {fmtCOP.format(Math.abs(cambiosData.totales.salieron.anticipos.saldo))}
                        </strong>
                        <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                          anticipo
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase sticky top-0">
                        <tr>
                          <th className="px-4 py-2.5">Tipo</th>
                          <th className="px-4 py-2.5">NIT</th>
                          <th className="px-4 py-2.5">Cliente</th>
                          <th className="px-4 py-2.5">Documento</th>
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Asesor</th>
                          <th className="px-4 py-2.5 text-right">Saldo anterior</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cambiosData.salieron.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                              Ningún documento salió entre estas fechas.
                            </td>
                          </tr>
                        ) : (
                          cambiosData.salieron.map((d) => (
                            <tr key={`sal-${d.tipo}-${d.nro_factura}`} className="hover:bg-slate-50">
                              <td className="px-4 py-2 uppercase font-semibold">{d.tipo}</td>
                              <td className="px-4 py-2 font-mono">{d.nit_cliente}</td>
                              <td className="px-4 py-2 font-medium text-slate-800">{d.nombre_cliente}</td>
                              <td className="px-4 py-2">{d.nro_factura}</td>
                              <td className="px-4 py-2">{formatFechaTexto(d.fecha_factura)}</td>
                              <td className="px-4 py-2">{d.vendedor || '—'}</td>
                              <td className="px-4 py-2 text-right">{renderMontoConAnticipo(d.tipo, d.saldo)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Entraron */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-3 justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800">
                      Entraron ({fmtNum.format(cambiosData.totales.entraron.cantidad)})
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="font-semibold text-slate-700 tabular-nums">
                        Facturas ({fmtNum.format(cambiosData.totales.entraron.facturas.cantidad)}):{' '}
                        <strong className="text-indigo-700">
                          {fmtCOP.format(cambiosData.totales.entraron.facturas.saldo)}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 tabular-nums">
                        Anticipos ({fmtNum.format(cambiosData.totales.entraron.anticipos.cantidad)}):{' '}
                        <strong className="text-teal-700">
                          {fmtCOP.format(Math.abs(cambiosData.totales.entraron.anticipos.saldo))}
                        </strong>
                        <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                          anticipo
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase sticky top-0">
                        <tr>
                          <th className="px-4 py-2.5">Tipo</th>
                          <th className="px-4 py-2.5">NIT</th>
                          <th className="px-4 py-2.5">Cliente</th>
                          <th className="px-4 py-2.5">Documento</th>
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Asesor</th>
                          <th className="px-4 py-2.5 text-right">Saldo nuevo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cambiosData.entraron.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                              Ningún documento entró entre estas fechas.
                            </td>
                          </tr>
                        ) : (
                          cambiosData.entraron.map((d) => (
                            <tr key={`ent-${d.tipo}-${d.nro_factura}`} className="hover:bg-slate-50">
                              <td className="px-4 py-2 uppercase font-semibold">{d.tipo}</td>
                              <td className="px-4 py-2 font-mono">{d.nit_cliente}</td>
                              <td className="px-4 py-2 font-medium text-slate-800">{d.nombre_cliente}</td>
                              <td className="px-4 py-2">{d.nro_factura}</td>
                              <td className="px-4 py-2">{formatFechaTexto(d.fecha_factura)}</td>
                              <td className="px-4 py-2">{d.vendedor || '—'}</td>
                              <td className="px-4 py-2 text-right">{renderMontoConAnticipo(d.tipo, d.saldo)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cambiaron (saldo o datos) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-3 justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800">
                      Cambiaron ({fmtNum.format(cambiosData.totales.cambiaron_saldo.cantidad)})
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="font-semibold text-slate-700 tabular-nums">
                        Facturas ({fmtNum.format(cambiosData.totales.cambiaron_saldo.facturas.cantidad)}):{' '}
                        <strong className="text-amber-700">
                          Dif {fmtCOP.format(cambiosData.totales.cambiaron_saldo.facturas.diferencia)}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 tabular-nums">
                        Anticipos ({fmtNum.format(cambiosData.totales.cambiaron_saldo.anticipos.cantidad)}):{' '}
                        <strong className="text-teal-700">
                          Dif{' '}
                          {fmtCOP.format(
                            Math.abs(cambiosData.totales.cambiaron_saldo.anticipos.saldo_despues) -
                              Math.abs(cambiosData.totales.cambiaron_saldo.anticipos.saldo_antes)
                          )}
                        </strong>
                        <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold uppercase">
                          anticipo
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="max-h-[380px] overflow-auto">
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase sticky top-0">
                        <tr>
                          <th className="px-4 py-2.5">Tipo</th>
                          <th className="px-4 py-2.5">NIT</th>
                          <th className="px-4 py-2.5">Cliente</th>
                          <th className="px-4 py-2.5">Documento</th>
                          <th className="px-4 py-2.5">Qué cambió</th>
                          <th className="px-4 py-2.5 text-right">Saldo antes</th>
                          <th className="px-4 py-2.5 text-right">Saldo después</th>
                          <th className="px-4 py-2.5 text-right">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cambiosData.cambiaron_saldo.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                              Ningún documento cambió entre estas fechas.
                            </td>
                          </tr>
                        ) : (
                          cambiosData.cambiaron_saldo.map((d) => (
                            <tr key={`chg-${d.tipo}-${d.nro_factura}`} className="hover:bg-slate-50 align-top">
                              <td className="px-4 py-2 uppercase font-semibold">{d.tipo}</td>
                              <td className="px-4 py-2 font-mono">{d.nit_cliente}</td>
                              <td className="px-4 py-2 font-medium text-slate-800">{d.nombre_cliente}</td>
                              <td className="px-4 py-2">{d.nro_factura}</td>
                              <td className="px-4 py-2 whitespace-normal min-w-[240px]">
                                <div className="flex flex-col gap-1">
                                  {(d.cambios || []).map((c, idx) => {
                                    const antesFmt =
                                      c.campo === 'saldo'
                                        ? d.tipo === 'anticipo'
                                          ? `${fmtCOP.format(Math.abs(Number(c.antes)))} (anticipo)`
                                          : fmtCOP.format(Number(c.antes))
                                        : String(c.antes);
                                    const despuesFmt =
                                      c.campo === 'saldo'
                                        ? d.tipo === 'anticipo'
                                          ? `${fmtCOP.format(Math.abs(Number(c.despues)))} (anticipo)`
                                          : fmtCOP.format(Number(c.despues))
                                        : String(c.despues);
                                    return (
                                      <div key={`${c.campo}-${idx}`} className="text-[11px] leading-snug">
                                        <span className="font-semibold text-slate-700">{c.etiqueta}:</span>{' '}
                                        <span className="text-slate-500">{antesFmt}</span>{' '}
                                        <span className="text-slate-400">→</span>{' '}
                                        <span className="font-medium text-slate-900">{despuesFmt}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right">{renderMontoConAnticipo(d.tipo, d.saldo_antes)}</td>
                              <td className="px-4 py-2 text-right">{renderMontoConAnticipo(d.tipo, d.saldo_despues)}</td>
                              <td
                                className={`px-4 py-2 text-right font-bold tabular-nums ${
                                  d.diferencia === 0
                                    ? 'text-slate-400'
                                    : d.diferencia < 0
                                    ? 'text-emerald-700'
                                    : 'text-red-600'
                                }`}
                              >
                                {fmtCOP.format(d.diferencia)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Pestaña Tendencia */}
        {tab === 'tendencia' && (
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-wrap gap-4 items-end justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Tendencia diaria de cartera
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evolución de facturas abiertas, vencido y anticipos por fecha de corte
                </p>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Desde</label>
                  <input
                    type="date"
                    value={tendDesde}
                    onChange={(e) => setTendDesde(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Hasta</label>
                  <input
                    type="date"
                    value={tendHasta}
                    onChange={(e) => setTendHasta(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              {loadingTendencia ? (
                <div className="py-12 text-center text-slate-500 animate-pulse">Cargando tendencia...</div>
              ) : errorTendencia ? (
                <div className="py-12 text-center text-red-500 text-sm">{errorTendencia}</div>
              ) : (
                <TendenciaSvg serie={tendencia} />
              )}
            </div>

            {tendencia.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">Fecha corte</th>
                        <th className="px-4 py-2.5 text-right">Documentos</th>
                        <th className="px-4 py-2.5 text-right">Facturas</th>
                        <th className="px-4 py-2.5 text-right">Vencido</th>
                        <th className="px-4 py-2.5 text-right">Anticipos</th>
                        <th className="px-4 py-2.5 text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tendencia.map((t) => (
                        <tr key={t.fecha} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-800">{t.fecha}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtNum.format(t.documentos)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {fmtCOP.format(t.facturas_saldo)}
                          </td>
                          <td className="px-4 py-2 text-right text-red-600 font-semibold tabular-nums">
                            {fmtCOP.format(t.vencido)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {renderMontoConAnticipo('anticipo', t.anticipos_saldo)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-bold tabular-nums ${
                              t.neto < 0 ? 'text-teal-700' : 'text-slate-900'
                            }`}
                          >
                            {fmtCOP.format(t.neto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
