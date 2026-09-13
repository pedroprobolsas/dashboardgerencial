const fs = require('fs');

const file = 'backend/src/routes/analisisMateriales.js';
let content = fs.readFileSync(file, 'utf8');

// Move require outside of map
const oldMap = `  const procesado = rows.map(r => {
    const pCot = parseFloat(r.precio_cotizado);
    const pReal = parseFloat(r.precio_real);
    const cantCot = parseFloat(r.cant_cotizada) || 0;
    const cantEjec = parseFloat(r.cant_ejecutada) || 0;
    const valCot = parseFloat(r.valor_cotizado) || 0;
    const valEjec = parseFloat(r.valor_ejecutado) || 0;
    const cump = parseFloat(r.cumplimiento) || 0;

    const { calcularEfectosMaterial } = require('../utils/materialesLogic');`;

const newMap = `  const { calcularEfectosMaterial } = require('../utils/materialesLogic');
  const procesado = rows.map(r => {
    const pCot = parseFloat(r.precio_cotizado);
    const pReal = parseFloat(r.precio_real);
    const cantCot = parseFloat(r.cant_cotizada) || 0;
    const cantEjec = parseFloat(r.cant_ejecutada) || 0;
    const valCot = parseFloat(r.valor_cotizado) || 0;
    const valEjec = parseFloat(r.valor_ejecutado) || 0;
    const cump = parseFloat(r.cumplimiento) || 0;`;

content = content.replace(oldMap, newMap);
fs.writeFileSync(file, content);
console.log('Fixed analisisMateriales require');
