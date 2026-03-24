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
  total_ingresos: string;
  total_egresos: string;
  cuentas_por_pagar_vigentes: string;
  obligaciones_vencidas: string;
  flujo_caja_disponible: string;
  comentario_variaciones: string;
  comentarios_generales: string;
  link_soporte: string;
}

type Errores = Partial<Record<keyof Campos, string>>;
type MapaPrellenado = Partial<Record<string, DatoPrellenado>>;

const CAMPOS_PRELLENADOS: Array<keyof Campos> = [
  'total_ingresos', 'total_egresos', 'flujo_caja_disponible',
];

const INICIAL: Campos = {
  periodo:                   generarPeriodos()[0].valor,
  total_ingresos:            '',
  total_egresos:             '',
  cuentas_por_pagar_vigentes:'',
  obligaciones_vencidas:     '',
  flujo_caja_disponible:     '',
  comentario_variaciones:    '',
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
  e.total_ingresos             = validarNumero(c.total_ingresos, 'Total ingresos', { min: 0 });
  e.total_egresos              = validarNumero(c.total_egresos, 'Total egresos', { min: 0 });
  e.cuentas_por_pagar_vigentes = validarNumero(c.cuentas_por_pagar_vigentes, 'Cuentas por pagar vigentes', { min: 0 });
  e.obligaciones_vencidas      = validarNumero(c.obligaciones_vencidas, 'Obligaciones vencidas', { min: 0 });
  if (c.flujo_caja_disponible === '') e.flujo_caja_disponible = 'Flujo de caja disponible es obligatorio.';
  else if (isNaN(Number(c.flujo_caja_disponible))) e.flujo_caja_disponible = 'Debe ser un número.';
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

export default function CierreFinanzasForm({ onEnviar }: Props) {
  const [datos, setDatos]             = useState<Campos>(INICIAL);
  const [errores, setErrores]         = useState<Errores>({});
  const [enviado, setEnviado]         = useState(false);
  const [borradorOk, setBorradorOk]   = useState(false);
  const [prellenados, setPrellenados] = useState<MapaPrellenado>({});
  const [cargandoPre, setCargandoPre] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargandoPre(true);
    setPrellenados({});

    fetchPrefill('Finanzas', datos.periodo)
      .then(resp => {
        if (cancelado) return;
        setPrellenados(resp.campos);
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
      .catch(() => {})
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
    if (datos.total_ingresos && isNaN(Number(datos.total_ingresos))) e.total_ingresos = 'Debe ser un número.';
    if (datos.total_egresos && isNaN(Number(datos.total_egresos))) e.total_egresos = 'Debe ser un número.';
    if (datos.link_soporte) { const err = validarURL(datos.link_soporte); if (err) e.link_soporte = err; }
    setErrores(e);
    if (Object.keys(e).length === 0) { setBorradorOk(true); setTimeout(() => setBorradorOk(false), 3000); }
  }

  function handleEnviar() {
    const e = validar(datos, prellenados);
    if (Object.keys(e).length > 0) { setErrores(e); return; }
    setErrores({});
    onEnviar({
      area: 'Finanzas',
      periodo: datos.periodo,
      responsable: 'Pedro Sandoval',
      datos: datos as unknown as Record<string, string>,
    });
    setEnviado(true);
  }

  if (enviado) {
    return <PantallaExito area="Finanzas" periodo={datos.periodo} onNuevo={() => { setDatos(INICIAL); setEnviado(false); setPrellenados({}); }} />;
  }

  const diffCritica = tieneDiffCritica(datos, prellenados);

  return (
    <div className="max-w-3xl mx-auto">
      <CabeceraFormulario area="Finanzas" />

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
              <Label requerido>Total ingresos</Label>
              <InputConPrellenado
                type="number"
                value={datos.total_ingresos}
                onChange={set('total_ingresos')}
                prefix="COP $"
                error={errores.total_ingresos}
                prellenado={prellenados.total_ingresos}
              />
              <ErrorMsg msg={errores.total_ingresos} />
            </div>
            <div>
              <Label requerido>Total egresos</Label>
              <InputConPrellenado
                type="number"
                value={datos.total_egresos}
                onChange={set('total_egresos')}
                prefix="COP $"
                error={errores.total_egresos}
                prellenado={prellenados.total_egresos}
              />
              <ErrorMsg msg={errores.total_egresos} />
            </div>
            <div>
              <Label requerido>Cuentas por pagar vigentes</Label>
              <Input type="number" value={datos.cuentas_por_pagar_vigentes} onChange={set('cuentas_por_pagar_vigentes')} placeholder="0" prefix="COP $" error={errores.cuentas_por_pagar_vigentes} />
              <ErrorMsg msg={errores.cuentas_por_pagar_vigentes} />
            </div>
            <div>
              <Label requerido>Obligaciones vencidas</Label>
              <Input type="number" value={datos.obligaciones_vencidas} onChange={set('obligaciones_vencidas')} placeholder="0" prefix="COP $" error={errores.obligaciones_vencidas} />
              <ErrorMsg msg={errores.obligaciones_vencidas} />
            </div>
            <div className="sm:col-span-2">
              <Label requerido>Flujo de caja disponible</Label>
              <InputConPrellenado
                type="number"
                value={datos.flujo_caja_disponible}
                onChange={set('flujo_caja_disponible')}
                prefix="COP $"
                error={errores.flujo_caja_disponible}
                prellenado={prellenados.flujo_caja_disponible}
              />
              <p className="text-xs text-dashboard-textMuted mt-1">Puede ser negativo. Se calcula automáticamente como ingresos − egresos.</p>
              <ErrorMsg msg={errores.flujo_caja_disponible} />
            </div>
          </div>

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

        <Seccion titulo="Análisis y comentarios">
          <div>
            <Label>Comentarios generales</Label>
            <Textarea value={datos.comentarios_generales} onChange={set('comentarios_generales')} placeholder="Cualquier observación adicional para la gerencia..." rows={3} />
          </div>
          <div>
            <Label>Enlace de soporte (Google Drive)</Label>
            <Input type="url" value={datos.link_soporte} onChange={set('link_soporte')} placeholder="https://drive.google.com/..." error={errores.link_soporte} />
            <ErrorMsg msg={errores.link_soporte} />
          </div>
        </Seccion>

        <BotonesFormulario onGuardar={handleGuardar} onEnviar={handleEnviar} />
      </div>
    </div>
  );
}
