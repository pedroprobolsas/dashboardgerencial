'use strict';

const { pool } = require('../dbClient');
const { obtenerBalancePruebaMes } = require('./siigoBalanceClient');
const {
  sumarDecimales,
  esDecimalCero,
  cumpleReglaCierreCostos,
} = require('../utils/xlsxBalanceParser');

const CLASES_FINANZAS = ['1', '2', '4', '5', '6'];
const FUENTE_REPORTE_BALANCE = 'api_balance';
const SCRIPT_VERSION_COSTOS = 'api-3.0';
const VOUCHER_COSTOS_API = 'BALANCE-API';
const DESCRIPCION_COSTOS_API = 'Débitos del mes según balance de prueba (API oficial SIIGO)';

/**
 * Obtiene la fecha actual en zona horaria America/Bogota (UTC-5).
 * @returns {{ anio: number, mes: number, dia: number, fechaStr: string }}
 */
function obtenerFechaHoyBogota() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const anio = Number(partes.find((p) => p.type === 'year')?.value);
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const dia = Number(partes.find((p) => p.type === 'day')?.value);
  const fechaStr = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

  return { anio, mes, dia, fechaStr };
}

/**
 * Obtiene el último día calendario de un mes (1-12).
 * @param {number} anio
 * @param {number} mes
 * @returns {number}
 */
function obtenerUltimoDiaMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Sincroniza un único mes contable desde la API oficial de SIIGO y actualiza en una sola transacción:
 *   1) app_ops.saldos_contables_siigo
 *   2) app_ops.siigo_costos_produccion_resumen
 *   3) app_ops.siigo_costos_produccion_detalle
 * Replica exactamente las reglas de /root/siigo-contable-api.py.
 *
 * @param {number} anio
 * @param {number} mes (1-12)
 */
async function recargarMesContableSiigo(anio, mes) {
  const hoy = obtenerFechaHoyBogota();
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  if (anio > hoy.anio || (anio === hoy.anio && mes > hoy.mes)) {
    throw new Error(`No se puede recargar un período futuro (${periodo})`);
  }

  const ultimoDia = obtenerUltimoDiaMes(anio, mes);
  const fechaInicioMes = `${periodo}-01`;
  const fechaUltimoMes = `${periodo}-${String(ultimoDia).padStart(2, '0')}`;
  const esMesActual = anio === hoy.anio && mes === hoy.mes;
  const fechaRegistro = esMesActual ? hoy.fechaStr : fechaUltimoMes;

  // 1) Consulta a SIIGO y validación en memoria ANTES de abrir transacción en BD
  const balance = await obtenerBalancePruebaMes(anio, mes);
  const aux = balance.filter((r) => r.transaccional);
  const fin = aux.filter((r) => CLASES_FINANZAS.includes(r.codigo[0]));
  const cos = aux.filter((r) => r.codigo.startsWith('72') || r.codigo.startsWith('73'));

  if (fin.length === 0) {
    throw new Error(`el balance de ${periodo} no trajo cuentas de Finanzas`);
  }

  const d72 = sumarDecimales(cos.filter((r) => r.codigo.startsWith('72')).map((r) => r.debito));
  const d73 = sumarDecimales(cos.filter((r) => r.codigo.startsWith('73')).map((r) => r.debito));
  const cred = sumarDecimales(cos.map((r) => r.credito));

  let estadoMes = 'pendiente';
  if (esMesActual) {
    estadoMes = 'parcial';
  } else if (cumpleReglaCierreCostos(d72, d73, cred)) {
    estadoMes = 'cerrado';
  }

  const filasDetalleCostos = cos.filter((r) => !esDecimalCero(r.debito));

  // 2) Escritura atómica de las 3 tablas en una sola transacción
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM app_ops.saldos_contables_siigo WHERE fecha BETWEEN $1::date AND $2::date`,
      [fechaInicioMes, fechaUltimoMes]
    );

    const valoresSaldos = [];
    const placeholdersSaldos = fin.map((r, idx) => {
      const base = idx * 9;
      valoresSaldos.push(
        fechaRegistro,
        r.codigo,
        r.nombre,
        Number(r.codigo[0]),
        r.saldo_inicial,
        r.debito,
        r.credito,
        r.saldo_final,
        FUENTE_REPORTE_BALANCE
      );
      return `($${base + 1}::date, $${base + 2}, $${base + 3}, $${base + 4}::smallint, $${base + 5}::numeric, $${base + 6}::numeric, $${base + 7}::numeric, $${base + 8}::numeric, $${base + 9})`;
    });

    await client.query(
      `INSERT INTO app_ops.saldos_contables_siigo (
        fecha, codigo_cuenta, nombre_cuenta, clase,
        saldo_inicial, movimiento_debito, movimiento_credito, saldo_final, fuente_reporte
      ) VALUES ${placeholdersSaldos.join(',\n')}`,
      valoresSaldos
    );

    await client.query(
      `INSERT INTO app_ops.siigo_costos_produccion_resumen (
        anio, mes, costos_mano_obra_72, costos_otros_73,
        cantidad_movimientos_72, cantidad_movimientos_73,
        lineas_cierre_excluidas, comprobantes_cierre,
        estado_mes, fecha_extraccion, fecha_actualizacion, script_version
      ) VALUES (
        $1, $2, $3::numeric, $4::numeric,
        0, 0, 0, NULL,
        $5, now(), now(), $6
      )
      ON CONFLICT (anio, mes) DO UPDATE SET
        costos_mano_obra_72 = EXCLUDED.costos_mano_obra_72,
        costos_otros_73 = EXCLUDED.costos_otros_73,
        cantidad_movimientos_72 = 0,
        cantidad_movimientos_73 = 0,
        lineas_cierre_excluidas = 0,
        comprobantes_cierre = NULL,
        estado_mes = EXCLUDED.estado_mes,
        fecha_actualizacion = now(),
        script_version = EXCLUDED.script_version`,
      [anio, mes, d72, d73, estadoMes, SCRIPT_VERSION_COSTOS]
    );

    await client.query(
      `DELETE FROM app_ops.siigo_costos_produccion_detalle WHERE anio = $1 AND mes = $2`,
      [anio, mes]
    );

    if (filasDetalleCostos.length > 0) {
      const valoresDetalle = [];
      const placeholdersDetalle = filasDetalleCostos.map((r, idx) => {
        const base = idx * 11;
        valoresDetalle.push(
          anio,
          mes,
          r.codigo,
          r.nombre,
          VOUCHER_COSTOS_API,
          0,
          fechaRegistro,
          DESCRIPCION_COSTOS_API,
          r.debito,
          0,
          false
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::date, $${base + 8}, $${base + 9}::numeric, $${base + 10}::numeric, $${base + 11})`;
      });

      await client.query(
        `INSERT INTO app_ops.siigo_costos_produccion_detalle (
          anio, mes, accounting_code, accounting_concept,
          voucher, sequence, elaboration_date, description,
          debit, credit, es_cierre
        ) VALUES ${placeholdersDetalle.join(',\n')}`,
        valoresDetalle
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const cuentasPorClase = {};
  for (const c of CLASES_FINANZAS) {
    cuentasPorClase[c] = fin.filter((r) => r.codigo[0] === c).length;
  }

  return {
    periodo,
    fecha_registro: fechaRegistro,
    estado_mes: estadoMes,
    total_cuentas: fin.length,
    cuentas_por_clase: cuentasPorClase,
    costos_72: Number(d72),
    costos_73: Number(d73),
    cuentas_costos_detalle: filasDetalleCostos.length,
  };
}

module.exports = {
  recargarMesContableSiigo,
};
