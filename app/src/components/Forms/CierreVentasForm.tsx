import { useState, useEffect } from 'react';
import type { InformeCierre } from '../../types/cierres';
import {
  generarPeriodos, Label, ErrorMsg, InputConPrellenado, Input, Textarea, Seccion,
  PeriodoSelector, BotonesFormulario, PantallaExito, CabeceraFormulario,
  validarNumero, validarURL, calcDiffPct,
} from './shared';
import type { DatoPrellenado } from './shared';
import { fetchPrefill } from '../../services/api';

interface Campos {
  periodo: string;
  total_ventas_mes: string;
  num_facturas: string;
  clientes_nuevos: string;
  pct_cumplimiento_meta: string;
  comentario_variaciones: string;
  asesor_mayor_venta: string;
  principal_obstaculo: string;
  plan_accion_siguiente_mes: string;
  comentarios_generales: string;
  link_soporte: string;
}

type Errores = Partial<Record<keyof Campos, string>>;
type MapaPrellenado = Partial<Record<string, DatoPrellenado>>;

const CAMPOS_PRELLENADOS: Array<keyof Campos> = [
  'total_ventas_mes', 'num_facturas', 'pct_cumplimiento_meta',
];

const INICIAL: Campos = {
  periodo:                   generarPeriodos()[0].valor,
  total_ventas_mes:          '',
  num_facturas:              '',
  clientes_nuevos:           '',
  pct_cumplimiento_meta:     '',
  comentario_variaciones:    '',
  asesor_mayor_venta:        '',
  principal_obstaculo:       '',
  plan_accion_siguiente_mes: '',
  comentarios_generales:     '',
  link_soporte:              '',
};

function tieneDiffCritica(c: Campos, pre: MapaPrellenado): boolean {
  return CAMPOS_PRELLENADOS.some(campo => {
    const p = pre[campo];
    if (!p) return false;
    const diff = calcDiffPct(p.valor, c[campo]);
    return diff !== null && diff > 10;
  });
}

function validar(c: Campos, pre: MapaPrellenado): Errores {
  const e: Errores = {};
  e.total_ventas_mes      = validarNumero(c.total_ventas_mes, 'Total ventas del mes', { min: 0 });
  e.num_facturas          = validarNumero(c.num_facturas, 'Número de facturas', { min: 0, entero: true });
  e.clientes_nuevos       = validarNumero(c.clientes_nuevos, 'Clientes nuevos', { min: 0, entero: true });
  e.pct_cumplimiento_meta = validarNumero(c.pct_cumplimiento_meta, '% Cumplimiento de meta', { min: 0 });
  if (!c.asesor_mayor_venta.trim()) e.asesor_mayor_venta = 'El asesor con mayor venta es obligatorio.';
  if (!c.principal_obstaculo.trim()) e.principal_obstaculo = 'Describe el principal obstáculo del mes.';
  if (!c.plan_accion_siguiente_mes.trim()) {
    e.plan_accion_siguiente_mes = 'El plan de acción es obligatorio.';
  } else if (c.plan_accion_siguiente_mes.trim().length < 100) {
    e.plan_accion_siguiente_mes = `Mínimo 100 caracteres. Llevas ${c.plan_accion_siguiente_mes.trim().length}.`;
  }
  e.link_soporte = validarURL(c.link_soporte);
  if (tieneDiffCritica(c, pre) && !c.comentario_variaciones.trim()) {
    e.comentario_variaciones = 'Debes justificar las diferencias > 10% con respecto al dato del sistema.';
  }
  (Object.keys(e) as (keyof Errores)[]).forEach(k => { if (!e[k]) delete e[k]; });
  return e;
}

interface Props {
  onEnviar: (informe: Omit<InformeCierre, 'id' | 'estado' | 'fechaEnvio'>) => void;
}

export default function CierreVentasForm({ onEnviar }: Props) {
  const [datos, setDatos]               = useState<Campos>(INICIAL);
  const [errores, setErrores]           = useState<Errores>({});
  const [enviado, setEnviado]           = useState(false);
  const [borradorOk, setBorradorOk]     = useState(false);
  const [prellenados, setPrellenados]   = useState<MapaPrellenado>({});
  const [cargandoPre, setCargandoPre]   = useState(false);

  // Carga datos del sistema al cambiar el período
  useEffect(() => {
    let cancelado = false;
    setCargandoPre(true);
    setPrellenados({});

    fetchPrefill('Ventas', datos.periodo)
      .then(resp => {
        if (cancelado) return;
        setPrellenados(resp.campos);
        // Auto-llenar campos vacíos
        setDatos(prev => {
          const nuevo = { ...prev };
          for (const campo of CAMPOS_PRELLENADOS) {
            const dato = resp.campos[campo];
            if (dato && nuevo[campo] === '') {
              (nuevo as Record<string, string>)[campo] = String(dato.valor);
            }
          }
          return nuevo;
        });
      })
      .catch(() => { /* ignora errores de prefill silenciosamente */ })
      .finally(() => { if (!cancelado) setCargandoPre(false); });

    return () => { cancelado = true; };
  }, [datos.periodo]);

  function set(campo: keyof Campos) {
    return (valor: string) => {
      setDatos(p => ({ ...p, [campo]: valor }));
      if (errores[campo]) setErrores(p => ({ ...p, [campo]: undefined }));
    };
  }

  function handleGuardar() {
    const e: Errores = {};
    if (datos.total_ventas_mes && isNaN(Number(datos.total_ventas_mes))) e.total_ventas_mes = 'Debe ser un número.';
    if (datos.link_soporte) { const err = validarURL(datos.link_soporte); if (err) e.link_soporte = err; }
    setErrores(e);
    if (Object.keys(e).length === 0) { setBorradorOk(true); setTimeout(() => setBorradorOk(false), 3000); }
  }

  function handleEnviar() {
    const e = validar(datos, prellenados);
    if (Object.keys(e).length > 0) { setErrores(e); return; }
    setErrores({});
    onEnviar({
      area: 'Ventas',
      periodo: datos.periodo,
      responsable: 'Pedro Sandoval',
      datos: datos as unknown as Record<string, string>,
    });
    setEnviado(true);
  }

  if (enviado) {
    return <PantallaExito area="Ventas" periodo={datos.periodo} onNuevo={() => { setDatos(INICIAL); setEnviado(false); setPrellenados({}); }} />;
  }

  const diffCritica = tieneDiffCritica(datos, prellenados);

  return (
    <div id="form-cierre-ventas" className="max-w-3xl mx-auto">
      <CabeceraFormulario area="Ventas" />

      {borradorOk && (
        <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
          <span>✓</span><span>Borrador guardado correctamente.</span>
        </div>
      )}
      {Object.keys(errores).length > 1 && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          Hay {Object.keys(errores).length} campos con errores. Revísalos antes de enviar.
        </div>
      )}

      <div className="space-y-5">
        <Seccion titulo="Período del informe">
          <PeriodoSelector value={datos.periodo} onChange={set('periodo')} error={errores.periodo} />
        </Seccion>

        <Seccion titulo={cargandoPre ? 'Cifras del mes — cargando datos del sistema…' : 'Cifras del mes'}>
          {cargandoPre && (
            <div className="flex items-center gap-2 text-xs text-blue-600 -mt-2 mb-1">
              <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block" />
              Leyendo datos desde Google Sheets…
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label requerido>Total ventas del mes</Label>
              <InputConPrellenado
                type="number"
                value={datos.total_ventas_mes}
                onChange={set('total_ventas_mes')}
                prefix="COP $"
                error={errores.total_ventas_mes}
                prellenado={prellenados.total_ventas_mes}
              />
              <ErrorMsg msg={errores.total_ventas_mes} />
            </div>
            <div>
              <Label requerido>Número de facturas</Label>
              <InputConPrellenado
                type="number"
                value={datos.num_facturas}
                onChange={set('num_facturas')}
                error={errores.num_facturas}
                prellenado={prellenados.num_facturas}
              />
              <ErrorMsg msg={errores.num_facturas} />
            </div>
            <div>
              <Label requerido>Clientes nuevos</Label>
              <Input type="number" value={datos.clientes_nuevos} onChange={set('clientes_nuevos')} placeholder="0" error={errores.clientes_nuevos} />
              <ErrorMsg msg={errores.clientes_nuevos} />
            </div>
            <div>
              <Label requerido>% Cumplimiento de meta</Label>
              <InputConPrellenado
                type="number"
                value={datos.pct_cumplimiento_meta}
                onChange={set('pct_cumplimiento_meta')}
                suffix="%"
                error={errores.pct_cumplimiento_meta}
                prellenado={prellenados.pct_cumplimiento_meta}
              />
              <ErrorMsg msg={errores.pct_cumplimiento_meta} />
            </div>
          </div>

          {/* Justificación de diferencias */}
          {(diffCritica || datos.comentario_variaciones) && (
            <div className={`mt-2 rounded-xl border p-4 ${diffCritica ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <Label requerido={diffCritica}>
                {diffCritica
                  ? '✕ Justificación de diferencias (obligatorio)'
                  : 'Comentario sobre variaciones'}
              </Label>
              <Textarea
                value={datos.comentario_variaciones}
                onChange={set('comentario_variaciones')}
                placeholder="Explica por qué los valores reportados difieren de los datos del sistema..."
                rows={3}
                error={errores.comentario_variaciones}
              />
              <ErrorMsg msg={errores.comentario_variaciones} />
            </div>
          )}
        </Seccion>

        <Seccion titulo="Análisis del período">
          <div>
            <Label requerido>Asesor con mayor venta del mes</Label>
            <Input value={datos.asesor_mayor_venta} onChange={set('asesor_mayor_venta')} placeholder="Nombre completo del asesor" error={errores.asesor_mayor_venta} />
            <ErrorMsg msg={errores.asesor_mayor_venta} />
          </div>
          <div>
            <Label requerido>Principal obstáculo del mes</Label>
            <Textarea value={datos.principal_obstaculo} onChange={set('principal_obstaculo')} placeholder="Describe el principal obstáculo que afectó el desempeño de ventas este mes..." rows={3} error={errores.principal_obstaculo} />
            <ErrorMsg msg={errores.principal_obstaculo} />
          </div>
          <div>
            <Label requerido>Plan de acción para el siguiente mes</Label>
            <Textarea value={datos.plan_accion_siguiente_mes} onChange={set('plan_accion_siguiente_mes')} placeholder="Describe detalladamente las acciones concretas que se ejecutarán el próximo mes..." rows={5} error={errores.plan_accion_siguiente_mes} minChars={100} />
            <ErrorMsg msg={errores.plan_accion_siguiente_mes} />
          </div>
        </Seccion>

        <Seccion titulo="Comentarios y soporte">
          <div>
            <Label>Comentarios generales</Label>
            <Textarea value={datos.comentarios_generales} onChange={set('comentarios_generales')} placeholder="Cualquier observación adicional relevante para la gerencia..." rows={3} />
          </div>
          <div>
            <Label>Enlace de soporte (Google Drive)</Label>
            <Input type="url" value={datos.link_soporte} onChange={set('link_soporte')} placeholder="https://drive.google.com/..." error={errores.link_soporte} />
            <p className="text-xs text-dashboard-textMuted mt-1">Opcional. Adjunta el link del archivo de soporte en Google Drive.</p>
            <ErrorMsg msg={errores.link_soporte} />
          </div>
        </Seccion>

        <BotonesFormulario onGuardar={handleGuardar} onEnviar={handleEnviar} />
      </div>
    </div>
  );
}
