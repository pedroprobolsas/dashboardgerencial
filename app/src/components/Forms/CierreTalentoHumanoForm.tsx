import { useState } from 'react';
import type { InformeCierre } from '../../types/cierres';
import {
  generarPeriodos, Label, ErrorMsg, Input, Textarea, Seccion,
  PeriodoSelector, BotonesFormulario, PantallaExito, CabeceraFormulario,
  validarNumero, validarURL,
} from './shared';

interface Campos {
  periodo: string;
  total_empleados: string;
  ingresos_mes: string;
  retiros_mes: string;
  horas_extra: string;
  dias_ausentismo: string;
  capacitaciones: string;
  incidentes_seguridad: string;
  clima_laboral: string;
  comentarios_generales: string;
  link_soporte: string;
}

type Errores = Partial<Record<keyof Campos, string>>;

const INICIAL: Campos = {
  periodo: generarPeriodos()[0].valor,
  total_empleados: '',
  ingresos_mes: '',
  retiros_mes: '',
  horas_extra: '',
  dias_ausentismo: '',
  capacitaciones: '',
  incidentes_seguridad: '',
  clima_laboral: '',
  comentarios_generales: '',
  link_soporte: '',
};

function validar(c: Campos): Errores {
  const e: Errores = {};
  e.total_empleados    = validarNumero(c.total_empleados, 'Total empleados', { min: 0, entero: true });
  e.ingresos_mes       = validarNumero(c.ingresos_mes, 'Ingresos del mes', { min: 0, entero: true });
  e.retiros_mes        = validarNumero(c.retiros_mes, 'Retiros del mes', { min: 0, entero: true });
  e.horas_extra        = validarNumero(c.horas_extra, 'Horas extra', { min: 0 });
  e.dias_ausentismo    = validarNumero(c.dias_ausentismo, 'Días de ausentismo', { min: 0 });
  e.capacitaciones     = validarNumero(c.capacitaciones, 'Capacitaciones', { min: 0, entero: true });
  e.incidentes_seguridad = validarNumero(c.incidentes_seguridad, 'Incidentes de seguridad', { min: 0, entero: true });
  if (!c.clima_laboral.trim()) e.clima_laboral = 'Describe el clima laboral del mes.';
  e.link_soporte = validarURL(c.link_soporte);
  (Object.keys(e) as (keyof Errores)[]).forEach(k => { if (!e[k]) delete e[k]; });
  return e;
}

interface Props {
  onEnviar: (informe: Omit<InformeCierre, 'id' | 'estado' | 'fechaEnvio'>) => void;
}

export default function CierreTalentoHumanoForm({ onEnviar }: Props) {
  const [datos, setDatos] = useState<Campos>(INICIAL);
  const [errores, setErrores] = useState<Errores>({});
  const [enviado, setEnviado] = useState(false);
  const [borradorOk, setBorradorOk] = useState(false);

  function set(campo: keyof Campos) {
    return (valor: string) => {
      setDatos(p => ({ ...p, [campo]: valor }));
      if (errores[campo]) setErrores(p => ({ ...p, [campo]: undefined }));
    };
  }

  // Calcula % rotación al vuelo si hay datos
  const rotacion = datos.total_empleados && datos.retiros_mes
    ? ((Number(datos.retiros_mes) / Number(datos.total_empleados)) * 100).toFixed(1)
    : null;

  function handleGuardar() {
    const e: Errores = {};
    if (datos.link_soporte) { const err = validarURL(datos.link_soporte); if (err) e.link_soporte = err; }
    setErrores(e);
    if (Object.keys(e).length === 0) { setBorradorOk(true); setTimeout(() => setBorradorOk(false), 3000); }
  }

  function handleEnviar() {
    const e = validar(datos);
    if (Object.keys(e).length > 0) { setErrores(e); return; }
    setErrores({});
    onEnviar({
      area: 'TalentoHumano',
      periodo: datos.periodo,
      responsable: 'Pedro Sandoval',
      datos: datos as unknown as Record<string, string>,
    });
    setEnviado(true);
  }

  if (enviado) {
    return <PantallaExito area="Talento Humano" periodo={datos.periodo} onNuevo={() => { setDatos(INICIAL); setEnviado(false); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <CabeceraFormulario area="Talento Humano" />

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

        <Seccion titulo="Movimiento de personal">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label requerido>Total empleados al cierre del mes</Label>
              <Input type="number" value={datos.total_empleados} onChange={set('total_empleados')} placeholder="0" suffix="personas" error={errores.total_empleados} />
              <ErrorMsg msg={errores.total_empleados} />
            </div>
            <div>
              <Label requerido>Ingresos del mes</Label>
              <Input type="number" value={datos.ingresos_mes} onChange={set('ingresos_mes')} placeholder="0" suffix="personas" error={errores.ingresos_mes} />
              <ErrorMsg msg={errores.ingresos_mes} />
            </div>
            <div>
              <Label requerido>Retiros del mes</Label>
              <Input type="number" value={datos.retiros_mes} onChange={set('retiros_mes')} placeholder="0" suffix="personas" error={errores.retiros_mes} />
              <ErrorMsg msg={errores.retiros_mes} />
            </div>

            {/* Indicador de rotación calculado al vuelo */}
            {rotacion !== null && (
              <div className={`sm:col-span-2 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm
                ${Number(rotacion) > 5 ? 'bg-red-50 border-red-200 text-red-700' :
                  Number(rotacion) > 3 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                         'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                <span className="text-xl">{Number(rotacion) > 5 ? '🔴' : Number(rotacion) > 3 ? '🟡' : '🟢'}</span>
                <div>
                  <p className="font-medium">Rotación calculada: {rotacion}% mensual</p>
                  <p className="text-xs opacity-80">
                    {Number(rotacion) > 5 ? 'Alerta — supera el umbral del 5%' :
                     Number(rotacion) > 3 ? 'En zona de precaución (3–5%)' :
                     'Dentro del rango normal (≤ 3%)'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Ausentismo, horas extra e incidentes">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label requerido>Horas extra del mes</Label>
              <Input type="number" value={datos.horas_extra} onChange={set('horas_extra')} placeholder="0" suffix="hrs" error={errores.horas_extra} />
              <ErrorMsg msg={errores.horas_extra} />
            </div>
            <div>
              <Label requerido>Días de ausentismo</Label>
              <Input type="number" value={datos.dias_ausentismo} onChange={set('dias_ausentismo')} placeholder="0" suffix="días" error={errores.dias_ausentismo} />
              <ErrorMsg msg={errores.dias_ausentismo} />
            </div>
            <div>
              <Label requerido>Capacitaciones realizadas</Label>
              <Input type="number" value={datos.capacitaciones} onChange={set('capacitaciones')} placeholder="0" error={errores.capacitaciones} />
              <ErrorMsg msg={errores.capacitaciones} />
            </div>
            <div>
              <Label requerido>Incidentes de seguridad</Label>
              <Input type="number" value={datos.incidentes_seguridad} onChange={set('incidentes_seguridad')} placeholder="0" error={errores.incidentes_seguridad} />
              <ErrorMsg msg={errores.incidentes_seguridad} />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Clima laboral y comentarios">
          <div>
            <Label requerido>Clima laboral del mes</Label>
            <Textarea
              value={datos.clima_laboral}
              onChange={set('clima_laboral')}
              placeholder="Describe el ambiente laboral del mes, situaciones destacadas, conflictos o logros del equipo..."
              rows={4}
              error={errores.clima_laboral}
            />
            <ErrorMsg msg={errores.clima_laboral} />
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
