export type AreaCierre = 'Ventas' | 'Finanzas' | 'Produccion' | 'Cartera' | 'TalentoHumano';
export type EstadoCierre = 'BORRADOR' | 'ENVIADO' | 'APROBADO' | 'RECHAZADO';

export interface InformeCierre {
  id: string;
  area: AreaCierre;
  periodo: string;
  estado: EstadoCierre;
  responsable: string;
  fechaEnvio: string;
  fechaAprobacion?: string;
  comentarioGerencia?: string;
  datos: Record<string, string>;
}

export const ETIQUETA_AREA: Record<AreaCierre, string> = {
  Ventas:         'Ventas',
  Finanzas:       'Finanzas',
  Produccion:     'Producción',
  Cartera:        'Cartera',
  TalentoHumano:  'Talento Humano',
};

export const ICONO_AREA: Record<AreaCierre, string> = {
  Ventas:        '📈',
  Finanzas:      '💰',
  Produccion:    '⚙️',
  Cartera:       '🏦',
  TalentoHumano: '👥',
};
