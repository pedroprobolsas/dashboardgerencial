'use strict';

function calcularEfectosMaterial({ cantCot, cantEjec, pCot, pReal, valEjec }) {
  let efectoCantidad = 0;
  let efectoPrecio = 0;
  let calculable = false;

  if (cantCot > 0 && !isNaN(pCot) && pCot !== null) {
    calculable = true;
    efectoCantidad = (cantCot - cantEjec) * pCot;
    
    if (!isNaN(pReal) && pReal !== null && cantEjec > 0) {
      efectoPrecio = (pCot - pReal) * cantEjec;
    } else if (cantEjec === 0) {
      efectoPrecio = 0;
    }
  } else if (cantCot === 0 && cantEjec > 0) {
    efectoCantidad = -valEjec;
    calculable = false;
  }

  return {
    efectoCantidad: calculable || (cantCot === 0 && cantEjec > 0) ? parseFloat(efectoCantidad.toFixed(2)) : null,
    efectoPrecio: calculable && cantEjec > 0 ? parseFloat(efectoPrecio.toFixed(2)) : null,
    calculable
  };
}

module.exports = { calcularEfectosMaterial };
