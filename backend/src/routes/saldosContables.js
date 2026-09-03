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

  const { rows } = await query(sql, params);

  res.json({ ok: true, data: rows });
}));

module.exports = router;
