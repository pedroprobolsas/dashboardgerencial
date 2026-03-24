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
  cartera_vigente: string;
  cartera_vencida: string;
  recaudo_mes: string;
  num_clientes_mora: string;
  comentario_variaciones: string;
  cliente_mayor_deuda: string;
  acciones_cobro: string;
  comentarios_generales: string;
  link_soporte: string;
}

type Errores = Partial<Record<keyof Campos, string>>;
type MapaPrellenado = Partial<Record<string, DatoPrellenado>>;

const CAMPOS_PRELLENADOS: Array<keyof Campos> = ['cartera_vencida', 'cartera_vigente'];

const INICIAL: Campos = {
  periodo:                generarPeriodos()[0].valor,
  cartera_vigente:        '',
  cartera_vencida:        '',
  recaudo_mes:            '',
  num_clientes_mora:      '',
  comentario_variaciones: '',
  cliente_mayor_deuda:    '',
  acciones_cobro:         '',
  comentarios_generales:  '',
  link_soporte:           '',
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
  e.cartera_vigente   = validarNumero(c.cartera_vigente, 'Cartera vigente', { min: 0 });
  e.cartera_vencida   = validarNumero(c.cartera_vencida, 'Cartera vencida', { min: 0 });
  e.recaudo_mes       = validarNumero(c.recaudo_mes, 'Recaudo del mes', { min: 0 });
  e.num_clientes_mora = validarNumero(c.num_clientes_mora, 'Número de clientes en mora', { min: 0, entero: true });

  const mora = Number(c.num_clientes_mora);
  if (mora > 0 && !c.cliente_mayor_deuda.trim()) {
    e.cliente_mayor_deuda = `Obligatorio cuando hay clientes en mora (${mora} registrado${mora !== 1 ? 's' : ''}).`;
  }
  if (!c.acciones_cobro.trim()) {
    e.acciones_cobro = 'Las acciones de cobro son obligatorias.';
  } else if (c.acciones_cobro.trim().length < 80) {
    e.acciones_cobro = `Mínimo 80 caracteres. Llevas ${c.acciones_cobro.trim().length}.`;
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

export default function CierreCarteraForm({ onEnviar }: Props) {
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

    fetchPrefill('Cartera', datos.periodo)
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
      if (campo === 'num_clientes_mora' && errores.cliente_mayor_deuda) {
        setErrores(p => ({ ...p, cliente_mayor_deuda: undefined }));
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
      area: 'Cartera',
      periodo: datos.periodo,
      responsable: 'Pedro Sandoval',
      datos: datos as unknown as Record<string, string>,
    });
    setEnviado(true);
  }

  if (enviado) {
    return <PantallaExito area="Cartera" periodo={datos.periodo} onNuevo={() => { setDatos(INICIAL); setEnviado(false); setPrellenados({}); }} />;
  }

  const diffCritica = tieneDiffCritica(datos, prellenados);
  const moraActiva  = Number(datos.num_clientes_mora) > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <CabeceraFormulario area="Cartera" />

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

        <Seccion titulo={cargandoPre ? 'Estado de la cartera — cargando datos del sistema…' : 'Estado de la cartera'}>
          {cargandoPre && (
            <div className="flex items-center gap-2 text-xs text-blue-600 -mt-2 mb-1">
              <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block" />
              Leyendo datos desde Google Sheets…
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label requerido>Cartera vigente</Label>
              <InputConPrellenado
                type="number"
                value={datos.cartera_vigente}
                onChange={set('cartera_vigente')}
                prefix="COP $"
                error={errores.cartera_vigente}
                prellenado={prellenados.cartera_vigente}
              />
              <ErrorMsg msg={errores.cartera_vigente} />
            </div>
            <div>
              <Label requerido>Cartera vencida</Label>
              <InputConPrellenado
                type="number"
                value={datos.cartera_vencida}
                onChange={set('cartera_vencida')}
                prefix="COP $"
                error={errores.cartera_vencida}
                prellenado={prellenados.cartera_vencida}
              />
              <ErrorMsg msg={errores.cartera_vencida} />
            </div>
            <div>
              <Label requerido>Recaudo del mes</Label>
              <Input type="number" value={datos.recaudo_mes} onChange={set('recaudo_mes')} placeholder="0" prefix="COP $" error={errores.recaudo_mes} />
              <ErrorMsg msg={errores.recaudo_mes} />
            </div>
            <div>
              <Label requerido>Número de clientes en mora</Label>
              <Input type="number" value={datos.num_clientes_mora} onChange={set('num_clientes_mora')} placeholder="0" suffix="clientes" error={errores.num_clientes_mora} />
              <ErrorMsg msg={errores.num_clientes_mora} />
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

        <Seccion titulo="Gestión de cobro">
          <div>
            <Label requerido={moraActiva}>
              Cliente con mayor deuda
              {moraActiva && <span className="ml-2 text-xs font-normal text-red-600">(obligatorio — hay {datos.num_clientes_mora} cliente{Number(datos.num_clientes_mora) !== 1 ? 's' : ''} en mora)</span>}
            </Label>
            <Input
              value={datos.cliente_mayor_deuda}
              onChange={set('cliente_mayor_deuda')}
              placeholder="Nombre o razón social del cliente con mayor saldo vencido"
              error={errores.cliente_mayor_deuda}
            />
            <ErrorMsg msg={errores.cliente_mayor_deuda} />
          </div>
          <div>
            <Label requerido>Acciones de cobro del mes</Label>
            <Textarea
              value={datos.acciones_cobro}
              onChange={set('acciones_cobro')}
              placeholder="Describe las acciones concretas de cobro realizadas este mes: llamadas, visitas, acuerdos de pago, demandas, etc..."
              rows={4}
              error={errores.acciones_cobro}
              minChars={80}
            />
            <ErrorMsg msg={errores.acciones_cobro} />
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
