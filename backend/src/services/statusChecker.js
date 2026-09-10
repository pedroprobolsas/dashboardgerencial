'use strict';

const db = require('../dbClient');
const { enviarAlerta } = require('./telegram');
const { diasHabilesEntre } = require('../utils/dateUtils');

/**
 * Verifica el estado de los pipelines y enva alertas si es necesario.
 */
async function verificarEstadoDatos() {
  console.log('[STATUS-CHECKER] Iniciando verificacin de estado de datos...');
  const now = new Date();
  
  try {
    const pipelines = await db.query('SELECT * FROM app_ops.pipeline_health WHERE activo = true');
    let transiciones = [];

    for (let p of pipelines.rows) {
      let maxDate = null;

      try {
        if (!p.es_snapshot) {
          // Consultar MAX de la columna de fecha
          const res = await db.query(`SELECT MAX(${p.columna_fecha}) as max_date FROM ${p.tabla_origen}`);
          if (res.rows.length > 0 && res.rows[0].max_date) {
            maxDate = new Date(res.rows[0].max_date);
          }
        } else {
          // Aproximacin para snapshots: pg_stat_user_tables.last_analyze
          const [schema, table] = p.tabla_origen.split('.');
          const q = `
            SELECT last_analyze, last_autoanalyze 
            FROM pg_stat_user_tables 
            WHERE schemaname = $1 AND relname = $2
          `;
          const res = await db.query(q, [schema, table]);
          if (res.rows.length > 0) {
            const la = res.rows[0].last_analyze;
            const laa = res.rows[0].last_autoanalyze;
            if (la && laa) {
              maxDate = new Date(Math.max(new Date(la), new Date(laa)));
            } else if (la) {
              maxDate = new Date(la);
            } else if (laa) {
              maxDate = new Date(laa);
            }
          }
        }
      } catch (err) {
        console.error(`[STATUS-CHECKER] Error al consultar datos para pipeline ${p.pipeline_id}:`, err.message);
      }

      let diasAtraso = null;
      let nuevoEstado = 'sin_datos';
      let mensaje = 'No hay datos o no se pudo determinar la fecha';
      
      if (maxDate) {
        // En Postgres, MAX devuelve UTC por defecto si es TIMESTAMP. Si es DATE asume el default.
        // Convertimos ambas a fechas base para evitar saltos raros.
        diasAtraso = diasHabilesEntre(maxDate, now);
        
        if (diasAtraso >= p.umbral_rojo_dias) {
          nuevoEstado = 'rojo';
          mensaje = `Pipeline atrasado ${diasAtraso} das hbiles`;
        } else if (diasAtraso >= p.umbral_amarillo_dias) {
          nuevoEstado = 'amarillo';
          mensaje = `Pipeline atrasado ${diasAtraso} das hbiles`;
        } else {
          nuevoEstado = 'verde';
          mensaje = `Datos al da. Atraso: ${diasAtraso} das hbiles`;
        }
      }

      const queryUpdate = `
        UPDATE app_ops.pipeline_health 
        SET 
          ultima_fecha_datos = $1, 
          ultima_verificacion = $2, 
          estado_anterior = estado, 
          estado = $3, 
          dias_atraso = $4, 
          mensaje = $5
        WHERE pipeline_id = $6
      `;
      
      await db.query(queryUpdate, [
        maxDate, 
        now, 
        nuevoEstado, 
        diasAtraso, 
        mensaje, 
        p.pipeline_id
      ]);

      if (p.estado && p.estado !== nuevoEstado && (nuevoEstado === 'amarillo' || nuevoEstado === 'rojo')) {
        transiciones.push({
          nombre: p.nombre_display,
          estado: nuevoEstado,
          ultimaFecha: maxDate ? maxDate.toISOString().split('T')[0] : 'Desconocida',
          atraso: diasAtraso
        });
      }
    }

    if (transiciones.length > 0) {
      console.log(`[STATUS-CHECKER] Se detectaron ${transiciones.length} transiciones de estado a amarillo/rojo. Enviando Telegram...`);
      
      const dateFormatter = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      const formatNow = dateFormatter.format(now);

      let msgHtml = `🚨 <b>Alertas de Estado de Datos</b>\nVerificado: ${formatNow}\n\n`;
      
      transiciones.forEach(t => {
        const icono = t.estado === 'rojo' ? '🔴' : '🟡';
        msgHtml += `${icono} <b>${t.nombre}</b>\n`;
        msgHtml += `   ltima data: ${t.ultimaFecha}  Atraso: ${t.atraso} das hbiles\n\n`;
      });
      
      msgHtml += `Ver detalle: https://ippgerencia.probolsas.co/estado-datos`;
      
      await enviarAlerta(msgHtml);
    } else {
      console.log('[STATUS-CHECKER] No hubo transiciones a amarillo/rojo que reportar.');
    }

  } catch (err) {
    console.error('[STATUS-CHECKER] Error fatal verificando estados:', err.message);
  }
}

module.exports = {
  verificarEstadoDatos
};
