'use strict';
const express = require('express');
const router = express.Router();
const { createSheetIfMissing } = require('../sheetsClient');

const SP1 = process.env.SPREADSHEET_ID_1;

// Columnas exactas por hoja según documento_maestro.md sección 5
const SCHEMAS = {
  Cierre_Ventas: [
    'ID_Registro','Período','Año','Mes','Responsable','Fecha_Envio','Estado',
    'Total_Ventas_Mes','Num_Facturas','Clientes_Nuevos','Pct_Cumplimiento_Meta',
    'Comentario_Variaciones',
    'Asesor_Mayor_Venta','Principal_Obstaculo','Plan_Accion_Siguiente_Mes',
    'Comentarios_Generales','Link_Soporte','Comentario_Gerencia','Fecha_Aprobacion',
  ],
  Cierre_Finanzas: [
    'ID_Registro','Período','Año','Mes','Responsable','Fecha_Envio','Estado',
    'Total_Ingresos','Total_Egresos','Utilidad_Bruta',
    'Cuentas_Por_Pagar_Vigentes','Obligaciones_Vencidas','Flujo_Caja_Disponible',
    'Variacion_Vs_Mes_Anterior','Comentario_Variaciones',
    'Comentarios_Generales','Link_Soporte','Comentario_Gerencia','Fecha_Aprobacion',
  ],
  Cierre_Produccion: [
    'ID_Registro','Período','Año','Mes','Responsable','Fecha_Envio','Estado',
    'Unidades_Producidas','Pct_Eficiencia_Maquinas','Horas_Paro_No_Programado',
    'Consumo_Materia_Prima_Kg','Pct_Scrap',
    'Comentario_Variaciones',
    'Causas_Paro','Inventario_Producto_Terminado','Comentarios_Generales','Link_Soporte',
    'Comentario_Gerencia','Fecha_Aprobacion',
  ],
  Cierre_Cartera: [
    'ID_Registro','Período','Año','Mes','Responsable','Fecha_Envio','Estado',
    'Cartera_Vigente','Cartera_Vencida','Recaudo_Mes','Num_Clientes_Mora',
    'Comentario_Variaciones',
    'Cliente_Mayor_Deuda','Acciones_Cobro',
    'Comentarios_Generales','Link_Soporte','Comentario_Gerencia','Fecha_Aprobacion',
  ],
  Cierre_TalentoHumano: [
    'ID_Registro','Período','Año','Mes','Responsable','Fecha_Envio','Estado',
    'Total_Empleados','Ingresos_Mes','Retiros_Mes','Horas_Extra',
    'Dias_Ausentismo','Capacitaciones','Incidentes_Seguridad','Clima_Laboral',
    'Comentarios_Generales','Link_Soporte','Comentario_Gerencia','Fecha_Aprobacion',
  ],
  Informes_cierre_mensual: [
    'ID_Registro','Período','Área','Responsable','Fecha_Envio','Estado',
    'Comentario_Gerencia','Fecha_Aprobacion',
  ],
};

/**
 * POST /api/setup
 * Crea las pestañas de cierre en Spreadsheet 1 si no existen.
 * Llamar una sola vez antes de usar los formularios.
 */
router.post('/', async (req, res) => {
  const resultados = {};
  try {
    for (const [nombre, headers] of Object.entries(SCHEMAS)) {
      resultados[nombre] = await createSheetIfMissing(SP1, nombre, headers);
    }
    res.json({ ok: true, resultados });
  } catch (err) {
    console.error('Error en /api/setup:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.SCHEMAS = SCHEMAS;
