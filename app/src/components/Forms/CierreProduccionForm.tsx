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
  unidades_producidas: string;
  pct_eficiencia_maquinas: string;
  horas_paro_no_programado: string;
  consumo_materia_prima_kg: string;
  pct_scrap: string;
  comentario_variaciones: string;
  causas_paro: string;
  inventario_producto_terminado: string;
  comentarios_generales: string;
  link_soporte: string;
}

type Errores = Partial<Record<keyof Campos, string>>;
type MapaPrellenado = Partial<Record<string, DatoPrellenado>>;

const CAMPOS_PRELLENADOS: Array<keyof Campos> = [
  'unidades_producidas', 'pct_eficiencia_maquinas', 'inventario_producto_terminado',
];

const INICIAL: Campos = {
  periodo:                       generarPeriodos()[0].valor,
  unidades_producidas:           '',
  pct_eficiencia_maquinas:       '',
  horas_paro_no_programado:      '',
  consumo_materia_prima_kg:      '',
  pct_scrap:                     '',
  comentario_variaciones:        '',
  causas_paro:                   '',
  inventario_producto_terminado: '',
  comentarios_generales:         '',
  link_soporte:                  '',
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
  e.unidades_producidas          = validarNumero(c.unidades_producidas, 'Unidades producidas', { min: 0 });
  e.pct_eficiencia_maquinas      = validarNumero(c.pct_eficiencia_maquinas, '% Eficiencia máquinas', { min: 0 });
  e.horas_paro_no_programado     = validarNumero(c.horas_paro_no_programado, 'Horas de paro no programado', { min: 0 });
  e.consumo_materia_prima_kg     = validarNumero(c.consumo_materia_prima_kg, 'Consumo materia prima', { min: 0 });
  e.pct_scrap                    = validarNumero(c.pct_scrap, '% Scrap', { min: 0, max: 100 });
  e.inventario_producto_terminado = validarNumero(c.inventario_producto_terminado, 'Inventario producto terminado', { min: 0 });
  const horas = Number(c.horas_paro_no_programado);
  if (horas > 0 && !c.causas_paro.trim()) {
    e.causas_paro = 'Las causas de paro son obligatorias cuando hay horas de paro > 0.';
  }
  if (tieneDiffCritica(c, pre) && !c.comentario_variaciones.trim()) {
    e.comentario_variaciones = 'Debes justificar las diferencias > 10% con respecto al dato del sistema.';
  }
  e.link_soporte = validarURL(c.link_soporte);
  (Object.keys(e) as (keyof Errores)[]).forEach(k => { if (!e[k]) delete e[k]; });
  return e;
}

interface Props {
  onEnviar: (informe: Omit<InformeCierre, 'id' | 'estado' | 'fechaEnvio'>) => void;
}

export default function CierreProduccionForm({ onEnviar }: Props) {
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

    fetchPrefill('Produccion', datos.periodo)
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
      if (campo === 'horas_paro_no_programado' && errores.causas_paro) {
        setErrores(p => ({ ...p, causas_paro: undefined }));
      }
    };
  }

  function handleGuardar() {
    const e: Errores = {};
    if (datos.link_soporte) { const err = validarURL(datos.link_soporte); if (err) e.link_soporte = err; }
    setErrores(e);
    if (Object.keys(e).length === 0) { setBorradorOk(true); setTimeout(() => setBorradorOk(false), 3000); }
  }

  function handleEnviar() {
    const e = validar(datos, prellenados);
    if (Object.keys(e).length > 0) { setErrores(e); return; }
    setErrores({});
    onEnviar({
      area: 'Produccion',
      periodo: datos.periodo,
      responsable: 'Pedro Sandoval',
      datos: datos as unknown as Record<string, string>,
    });
    setEnviado(true);
  }

  if (enviado) {
    return <PantallaExito area="Producción" periodo={datos.periodo} onNuevo={() => { setDatos(INICIAL); setEnviado(false); setPrellenados({}); }} />;
  }

  const diffCritica  = tieneDiffCritica(datos, prellenados);
  const parosActivos = Number(datos.horas_paro_no_programado) > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <CabeceraFormulario area="Producción" />

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

        <Seccion titulo={cargandoPre ? 'Indicadores de producción — cargando datos del sistema…' : 'Indicadores de producción'}>
          {cargandoPre && (
            <div className="flex items-center gap-2 text-xs text-blue-600 -mt-2 mb-1">
              <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block" />
              Leyendo datos desde Google Sheets…
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label requerido>Unidades producidas</Label>
              <InputConPrellenado
                type="number"
                value={datos.unidades_producidas}
                onChange={set('unidades_producidas')}
                error={errores.unidades_producidas}
                prellenado={prellenados.unidades_producidas}
              />
              <ErrorMsg msg={errores.unidades_producidas} />
            </div>
            <div>
              <Label requerido>% Eficiencia de máquinas</Label>
              <InputConPrellenado
                type="number"
                value={datos.pct_eficiencia_maquinas}
                onChange={set('pct_eficiencia_maquinas')}
                suffix="%"
                error={errores.pct_eficiencia_maquinas}
                prellenado={prellenados.pct_eficiencia_maquinas}
              />
              <ErrorMsg msg={errores.pct_eficiencia_maquinas} />
            </div>
            <div>
              <Label requerido>Horas de paro no programado</Label>
              <Input type="number" value={datos.horas_paro_no_programado} onChange={set('horas_paro_no_programado')} placeholder="0" suffix="hrs" error={errores.horas_paro_no_programado} />
              <ErrorMsg msg={errores.horas_paro_no_programado} />
            </div>
            <div>
              <Label requerido>Consumo de materia prima</Label>
              <Input type="number" value={datos.consumo_materia_prima_kg} onChange={set('consumo_materia_prima_kg')} placeholder="0" suffix="kg" error={errores.consumo_materia_prima_kg} />
              <ErrorMsg msg={errores.consumo_materia_prima_kg} />
            </div>
            <div>
              <Label requerido>% Scrap</Label>
              <Input type="number" value={datos.pct_scrap} onChange={set('pct_scrap')} placeholder="0" suffix="%" error={errores.pct_scrap} />
              <ErrorMsg msg={errores.pct_scrap} />
            </div>
            <div>
              <Label requerido>Inventario de producto terminado (valor COP)</Label>
              <InputConPrellenado
                type="number"
                value={datos.inventario_producto_terminado}
                onChange={set('inventario_producto_terminado')}
                prefix="COP $"
                error={errores.inventario_producto_terminado}
                prellenado={prellenados.inventario_producto_terminado}
              />
              <ErrorMsg msg={errores.inventario_producto_terminado} />
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

        <Seccion titulo="Paros y análisis">
          <div>
            <Label requerido={parosActivos}>
              Causas de paro
              {parosActivos && <span className="ml-2 text-xs font-normal text-red-600">(obligatorio — hay {datos.horas_paro_no_programado} hrs de paro registradas)</span>}
            </Label>
            <Textarea
              value={datos.causas_paro}
              onChange={set('causas_paro')}
              placeholder="Describe las causas de los paros no programados ocurridos en el mes..."
              rows={3}
              error={errores.causas_paro}
            />
            <ErrorMsg msg={errores.causas_paro} />
          </div>
          <div>
            <Label>Comentarios generales</Label>
            <Textarea value={datos.comentarios_generales} onChange={set('comentarios_generales')} placeholder="Observaciones adicionales para la gerencia..." rows={3} />
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
