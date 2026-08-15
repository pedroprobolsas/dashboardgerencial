'use strict';
const { Router }    = require('express');
const { query }     = require('../dbClient');
const asyncHandler  = require('../asyncHandler');
const cache         = require('../cache');
const logger        = require('../logger');

const router   = Router();
const ENDPOINT = '/api/analisis_materiales';

router.get('/', asyncHandler(ENDPOINT, async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;

  if (!fecha_inicio || !fecha_fin) {
    return res.status(400).json({ ok: false, error: 'Parámetros requeridos: fecha_inicio y fecha_fin (YYYY-MM-DD)' });
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(fecha_inicio) || !isoDate.test(fecha_fin)) {
    return res.status(400).json({ ok: false, error: 'Formato de fecha inválido. Usa YYYY-MM-DD.' });
  }

  if (fecha_inicio > fecha_fin) {
    return res.status(400).json({ ok: false, error: 'fecha_inicio no puede ser mayor que fecha_fin.' });
  }

  const cacheKey = `analisis_materiales:${fecha_inicio}:${fecha_fin}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(ENDPOINT, 'Cache HIT', { fecha_inicio, fecha_fin });
    return res.json(cached);
  }

  // Se traen las cantidades de OP, se calcula factor_volumen, cant_esperada, y los tres efectos.
  // Convención: efecto negativo = sobrecosto.
  // efecto_volumen = (cant_cot - cant_esp) * Pcot
  // efecto_rendimiento = (cant_esp - cant_ejec) * Pcot
  // efecto_precio = (Pcot - Preal) * cant_ejec
  
  const sql = `
    SELECT
      d.nro_op,
      d.referencia,
      d.item AS material,
      o.cantidades_cotizado AS op_cant_cotizada,
      o.cantidades_ejecutado AS op_cant_ejecutada,
      
      ROUND(d.cant_cotizada, 4) AS cant_cotizada,
      ROUND(d.cant_ejecutada, 4) AS cant_ejecutada,
      ROUND(d.valor_cotizado, 2) AS valor_cotizado,
      ROUND(d.valor_ejecutado, 2) AS valor_ejecutado,
      ROUND(d.cumplimiento, 2) AS cumplimiento,
      
      CASE 
        WHEN d.cant_cotizada > 0 THEN ROUND(((d.cant_ejecutada - d.cant_cotizada) / d.cant_cotizada) * 100, 2) 
        ELSE NULL 
      END AS diferencia_cant_pct,
      
      ROUND(d.valor_cotizado / NULLIF(d.cant_cotizada, 0), 2) AS precio_cotizado,
      ROUND(d.valor_ejecutado / NULLIF(d.cant_ejecutada, 0), 2) AS precio_real
      
    FROM crisolweb.costo_por_orden_detalle d
    JOIN crisolweb.costo_por_orden o ON d.nro_op = o.nro_op AND d.referencia = o.referencia
    WHERE o.fecha >= $1::date
      AND o.fecha <= $2::date
      AND d.categoria = 'material'
    ORDER BY d.nro_op DESC
  `;

  const { rows } = await query(sql, [fecha_inicio, fecha_fin]);

  const procesado = rows.map(r => {
    const pCot = parseFloat(r.precio_cotizado);
    const pReal = parseFloat(r.precio_real);
    const cantCot = parseFloat(r.cant_cotizada) || 0;
    const cantEjec = parseFloat(r.cant_ejecutada) || 0;
    const opCantCot = parseFloat(r.op_cant_cotizada) || 0;
    const opCantEjec = parseFloat(r.op_cant_ejecutada) || 0;
    const valCot = parseFloat(r.valor_cotizado) || 0;
    const valEjec = parseFloat(r.valor_ejecutado) || 0;
    const cump = parseFloat(r.cumplimiento) || 0;

    let factorVolumen = 1;
    let cantEsperada = cantCot;
    let efectoVolumen = 0;
    let efectoRendimiento = 0;
    let efectoPrecio = 0;
    let calculable = false;

    // Si hay datos para hacer los cálculos
    if (opCantCot > 0 && cantCot > 0 && !isNaN(pCot)) {
      calculable = true;
      factorVolumen = opCantEjec / opCantCot;
      cantEsperada = cantCot * factorVolumen;
      
      efectoVolumen = (cantCot - cantEsperada) * pCot;
      efectoRendimiento = (cantEsperada - cantEjec) * pCot;
      
      if (!isNaN(pReal) && cantEjec > 0) {
        efectoPrecio = (pCot - pReal) * cantEjec;
      } else if (cantEjec === 0) {
        // No ejecutado, efecto precio no aplica
        efectoPrecio = 0;
      }
    } else if (cantCot === 0 && cantEjec > 0) {
      // No cotizado (Sustituido o añadido) -> Todo el valor ejecutado es sobrecosto de rendimiento (pérdida)
      efectoRendimiento = -valEjec;
      calculable = false;
    } else if (opCantCot === 0) {
      // OP sin cotizar, no se puede medir rendimiento esperado
      calculable = false;
    }

    return {
      nro_op: r.nro_op,
      referencia: r.referencia,
      material: r.material,
      cant_cotizada: cantCot,
      cant_esperada: calculable ? parseFloat(cantEsperada.toFixed(4)) : null,
      cant_ejecutada: cantEjec,
      diferencia_cant_pct: r.diferencia_cant_pct,
      valor_cotizado: valCot,
      valor_ejecutado: valEjec,
      cumplimiento: cump,
      precio_cotizado: isNaN(pCot) ? null : pCot,
      precio_real: isNaN(pReal) ? null : pReal,
      efecto_volumen: calculable ? parseFloat(efectoVolumen.toFixed(2)) : null,
      efecto_rendimiento: calculable || (cantCot === 0 && cantEjec > 0) ? parseFloat(efectoRendimiento.toFixed(2)) : null,
      efecto_precio: calculable && cantEjec > 0 ? parseFloat(efectoPrecio.toFixed(2)) : null,
      calculable
    };
  });

  const resultado = {
    ok: true,
    filtros: { fecha_inicio, fecha_fin },
    total: procesado.length,
    detalle: procesado,
  };

  cache.set(cacheKey, resultado);
  logger.info(ENDPOINT, `OK — ${procesado.length} líneas de materiales`, { fecha_inicio, fecha_fin });

  return res.json(resultado);
}));

module.exports = router;
