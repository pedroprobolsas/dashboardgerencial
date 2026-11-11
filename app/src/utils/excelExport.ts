// Wrapper sobre la librería de Excel: si se cambia `xlsx` por otra, solo se edita este archivo.
import * as XLSX from 'xlsx';

export interface ColumnaExcel<T> {
  encabezado: string;
  obtenerValor: (fila: T) => string | number | null;
  anchoCaracteres?: number;
}

export interface OpcionesExportacionExcel<T> {
  nombreArchivo: string;
  nombreHoja: string;
  columnas: ColumnaExcel<T>[];
  filas: T[];
}

export function exportarFilasAExcel<T>({ nombreArchivo, nombreHoja, columnas, filas }: OpcionesExportacionExcel<T>): void {
  const encabezados = columnas.map(c => c.encabezado);
  const cuerpo = filas.map(fila => columnas.map(c => c.obtenerValor(fila)));
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...cuerpo]);
  hoja['!cols'] = columnas.map(c => ({ wch: c.anchoCaracteres ?? Math.max(c.encabezado.length + 2, 12) }));

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  XLSX.writeFile(libro, nombreArchivo);
}
