export type Vista =
  | 'dashboard'
  | 'vista-diaria'
  | 'cierre-ventas'
  | 'cierre-finanzas'
  | 'cierre-produccion'
  | 'cierre-cartera'
  | 'cierre-talento-humano'
  | 'bandeja-aprobacion';

interface Props {
  vistaActual: Vista;
  onNavegar: (vista: Vista) => void;
  pendientesAprobacion: number;
}

interface NavItem {
  id: Vista;
  etiqueta: string;
  icono: string;
}

const itemsDashboard: NavItem[] = [
  { id: 'dashboard',    etiqueta: 'Dashboard',    icono: '▦' },
  { id: 'vista-diaria', etiqueta: 'Vistazo Diario', icono: '📅' },
];

const itemsCierre: NavItem[] = [
  { id: 'cierre-ventas',         etiqueta: 'Ventas',         icono: '📈' },
  { id: 'cierre-finanzas',       etiqueta: 'Finanzas',       icono: '💰' },
  { id: 'cierre-produccion',     etiqueta: 'Producción',     icono: '⚙️' },
  { id: 'cierre-cartera',        etiqueta: 'Cartera',        icono: '🏦' },
  { id: 'cierre-talento-humano', etiqueta: 'Talento Humano', icono: '👥' },
];

export default function Sidebar({ vistaActual, onNavegar, pendientesAprobacion }: Props) {
  function Item({ item }: { item: NavItem }) {
    const activo = vistaActual === item.id;
    return (
      <button
        onClick={() => onNavegar(item.id)}
        className={`w-full text-left flex items-center gap-2.5 p-3 rounded-xl text-sm transition-colors duration-200
          ${activo ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
      >
        <span className="text-base leading-none">{item.icono}</span>
        <span>{item.etiqueta}</span>
      </button>
    );
  }

  const activoBandeja = vistaActual === 'bandeja-aprobacion';

  return (
    <aside className="w-64 h-screen bg-dashboard-sidebar text-white flex flex-col pt-8 pb-4 px-4 shrink-0">

      {/* Logo */}
      <div className="flex items-center justify-center mb-10">
        <h1 className="text-2xl font-bold tracking-wider">Probolsas</h1>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-6 overflow-y-auto">

        {/* Principal */}
        <div className="space-y-1">
          {itemsDashboard.map(item => <Item key={item.id} item={item} />)}
        </div>

        {/* Cierre mensual */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Cierre mensual</p>
          <div className="space-y-1">
            {itemsCierre.map(item => <Item key={item.id} item={item} />)}
          </div>
        </div>

        {/* Gerencia */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Gerencia</p>
          <button
            onClick={() => onNavegar('bandeja-aprobacion')}
            className={`w-full text-left flex items-center gap-2.5 p-3 rounded-xl text-sm transition-colors duration-200
              ${activoBandeja ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <span className="text-base leading-none">📋</span>
            <span className="flex-1">Aprobaciones</span>
            {pendientesAprobacion > 0 && (
              <span className="bg-probolsas-cyan text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {pendientesAprobacion}
              </span>
            )}
          </button>
        </div>

      </nav>

      {/* Pie de sidebar */}
      <div className="mt-auto border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between text-sm text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-probolsas-navy flex items-center justify-center text-white text-xs font-bold">PS</div>
            <span>Pedro Sandoval</span>
          </div>
          <button className="text-xs text-probolsas-cyan hover:text-white transition-colors duration-200">Salir</button>
        </div>
      </div>

    </aside>
  );
}
