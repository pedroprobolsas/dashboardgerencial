'use strict';

/**
 * Calcula la diferencia en días hábiles (lunes a viernes) entre dos fechas.
 * Utilizado para el cálculo preciso de la desactualización.
 */
function diasHabilesEntre(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  let count = 0;
  let cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  if (cur > end) return 0; 
  
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // Omitir Domingo(0) y Sábado(6)
      count++;
    }
  }
  return count;
}

module.exports = {
  diasHabilesEntre
};
