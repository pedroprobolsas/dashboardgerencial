const express = require('express');
const router = express.Router();
const asyncHandler = require('../asyncHandler');
const { query } = require('../dbClient');

router.get('/', asyncHandler('/api/saldos-contables', async (req, res) => {
  const anio = parseInt(req.query.anio, 10);
  const mes = parseInt(req.query.mes, 10);

  let sql = `
    SELECT fecha, clase, valor, tipo
    FROM app_ops.v_saldos_mensuales_por_clase
  `;
  const params = [];

  if (anio && mes) {
    const primerDiaMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
    sql += ` WHERE fecha >= $1::date AND fecha < ($1::date + INTERVAL '1 month')`;
    params.push(primerDiaMes);
  } else if (anio) {
    sql += ` WHERE EXTRACT(YEAR FROM fecha) = $1`;
    params.push(anio);
  }

  sql += ` ORDER BY fecha ASC, clase ASC`;

  const [saldosRes, maxFechaRes] = await Promise.all([
    query(sql, params),
    query(`SELECT MAX(creado_en) as max_fecha FROM app_ops.saldos_contables_siigo`)
  ]);

  res.json({ 
    ok: true, 
    data: saldosRes.rows,
    ultima_actualizacion: maxFechaRes.rows[0]?.max_fecha || null
  });
}));

router.get('/detalle', asyncHandler('/api/saldos-contables/detalle', async (req, res) => {
  const { clase, fecha } = req.query;

  if (!clase || !fecha) {
    return res.status(400).json({ ok: false, error: 'Se requieren parámetros clase y fecha' });
  }

  // Las clases de balance (Activos=1, Pasivos=2) usan saldo_final, 
  // las de resultados (Gastos=5, Costos de Venta=6) usan movimiento_debito
  const claseNum = parseInt(clase, 10);
  const usaMovimiento = [5, 6].includes(claseNum);
  const valorCol = usaMovimiento ? 'movimiento_debito' : 'saldo_final';

  // Usamos el patrón de rango para cubrir la fecha de fin de mes
  // Se asume que 'fecha' viene como YYYY-MM-DD
  const primerDiaMes = `${fecha.substring(0, 7)}-01`;

  const sql = `
    SELECT 
      codigo_cuenta, 
      nombre_cuenta, 
      ${valorCol} AS valor
    FROM app_ops.saldos_contables_siigo
    WHERE clase = $1
      AND fecha >= $2::date AND fecha < ($2::date + INTERVAL '1 month')
    ORDER BY codigo_cuenta ASC
  `;
  
  const { rows } = await query(sql, [claseNum, primerDiaMes]);

  res.json({ ok: true, data: rows });
}));

module.exports = router;
