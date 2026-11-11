import { useState } from 'react';
import { Download } from 'lucide-react';
import { fetchSaldosContablesExport, type SaldoContableExportFila } from '../../services/api';
import { exportarFilasAExcel, type ColumnaExcel } from '../../utils/excelExport';

const aNumero = (valor: string | null | undefined): number => Number(valor ?? 0);

const COLUMNAS_BALANCE: ColumnaExcel<SaldoContableExportFila>[] = [
  { encabezado: 'Período', obtenerValor: f => f.periodo, anchoCaracteres: 10 },
  { encabezado: 'Clase', obtenerValor: f => Number(f.clase), anchoCaracteres: 8 },
  { encabezado: 'Cuenta', obtenerValor: f => f.codigo_cuenta, anchoCaracteres: 14 },
  { encabezado: 'Concepto', obtenerValor: f => f.nombre_cuenta ?? '', anchoCaracteres: 40 },
  { encabezado: 'Saldo anterior', obtenerValor: f => aNumero(f.saldo_inicial), anchoCaracteres: 18 },
  { encabezado: 'Movimiento débito', obtenerValor: f => aNumero(f.movimiento_debito), anchoCaracteres: 18 },
  { encabezado: 'Movimiento crédito', obtenerValor: f => aNumero(f.movimiento_credito), anchoCaracteres: 18 },
  { encabezado: 'Movimiento del mes', obtenerValor: f => aNumero(f.movimiento_mes), anchoCaracteres: 18 },
  { encabezado: 'Saldo final', obtenerValor: f => aNumero(f.saldo_final), anchoCaracteres: 18 },
];

/** Exporta el balance del período (YYYY-MM) del selector. El nombre del archivo sale del texto del período, sin pasar por Date. */
export default function ExportarBalanceExcelButton({ periodo }: { periodo: string }) {
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportar = async () => {
    setExportando(true);
    setError(null);
    try {
      const [anio, mes] = periodo.split('-').map(Number);
      const filas = await fetchSaldosContablesExport(anio, mes);
      if (filas.length === 0) {
        setError('Sin datos para el período seleccionado');
        return;
      }
      exportarFilasAExcel({
        nombreArchivo: `${periodo} balance.xlsx`,
        nombreHoja: 'Balance',
        columnas: COLUMNAS_BALANCE,
        filas,
      });
    } catch (err: any) {
      setError(err.message || 'No se pudo exportar el balance');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleExportar}
        disabled={exportando}
        className="flex items-center gap-1.5 text-sm bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-dashboard-textMain hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        <Download size={14} />
        {exportando ? 'Exportando...' : 'Exportar a Excel'}
      </button>
      {error && (
        <span className="text-[11px] text-red-500 mt-1 max-w-[220px] truncate" title={error}>{error}</span>
      )}
    </div>
  );
}
