import { useState, useEffect } from 'react';
import { useAuth } from '../Auth/AuthContext';

export type Vista =
  | 'dashboard'
  | 'vista-diaria'
  | 'cierre-ventas'
  | 'cierre-finanzas'
  | 'cierre-produccion'
  | 'cierre-cartera'
  | 'cierre-talento-humano'
  | 'bandeja-aprobacion'
  | 'costo-produccion-detalle'
  | 'analisis-responsables'
  | 'analisis-materiales'
  | 'movimiento-materiales'
  | 'configuracion'
  | 'usuarios';

interface Props {
  vistaActual: Vista;
  onNavegar: (vista: Vista) => void;
  pendientesAprobacion: number;
}

interface NavItem {
  id: Vista;
  etiqueta: string;
  icono: string;
  badge?: number;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export default function Sidebar({ vistaActual, onNavegar, pendientesAprobacion }: Props) {
  const { user, logout } = useAuth();
  
  // Agrupar items
  const grupos: NavGroup[] = [
    {
      id: 'analisis',
      title: 'Análisis',
      items: [
        { id: 'dashboard', etiqueta: 'Dashboard', icono: '▦' },
        { id: 'vista-diaria', etiqueta: 'Vistazo Diario', icono: '📅' },
        { id: 'costo-produccion-detalle', etiqueta: 'Margen por OP', icono: '⚙️' },
        { id: 'analisis-responsables', etiqueta: 'Análisis Responsables', icono: '👥' },
        { id: 'analisis-materiales', etiqueta: 'Análisis Materiales', icono: '📦' },
        { id: 'movimiento-materiales', etiqueta: 'Movimiento de Materiales', icono: '🔄' },
      ]
    },
    {
      id: 'cierre',
      title: 'Cierre Mensual',
      items: [
        { id: 'cierre-ventas', etiqueta: 'Ventas', icono: '📈' },
        { id: 'cierre-finanzas', etiqueta: 'Finanzas', icono: '💰' },
        { id: 'cierre-produccion', etiqueta: 'Producción', icono: '⚙️' },
        { id: 'cierre-cartera', etiqueta: 'Cartera', icono: '🏦' },
        { id: 'cierre-talento-humano', etiqueta: 'Talento Humano', icono: '👥' },
      ]
    },
    {
      id: 'gerencia',
      title: 'Gerencia',
      items: [
        { id: 'bandeja-aprobacion', etiqueta: 'Aprobaciones', icono: '📋', badge: pendientesAprobacion },
        { id: 'configuracion', etiqueta: 'Configuración', icono: '⚙️' },
        ...(user?.rol === 'admin' ? [{ id: 'usuarios' as Vista, etiqueta: 'Usuarios', icono: '🔐' }] : []),
      ]
    }
  ];

  // Estado de los collapsibles
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const guardado = localStorage.getItem('sidebarOpenGroups');
    if (guardado) {
      try {
        return JSON.parse(guardado);
      } catch (e) {}
    }
    // Por defecto todos abiertos
    return { analisis: true, cierre: true, gerencia: true };
  });

  useEffect(() => {
    localStorage.setItem('sidebarOpenGroups', JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };
  
  function Item({ item }: { item: NavItem }) {
    const activo = vistaActual === item.id;
    return (
      <button
        onClick={() => onNavegar(item.id)}
        className={`w-full text-left flex items-center gap-2.5 p-3 rounded-xl text-sm transition-colors duration-200
          ${activo ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
      >
        <span className="text-base leading-none">{item.icono}</span>
        <span className="flex-1 truncate">{item.etiqueta}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="bg-probolsas-cyan text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
            {item.badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="w-64 h-full bg-dashboard-sidebar text-white flex flex-col pt-8 pb-4 px-4 shadow-xl">
      
      {/* Logo */}
      <div className="flex items-center justify-center mb-8 shrink-0">
        <h1 className="text-2xl font-bold tracking-wider">Probolsas</h1>
      </div>

      {/* Navegación Scrolleable */}
      <nav className="flex-1 overflow-y-auto space-y-6 pr-1">
        {grupos.map(grupo => (
          <div key={grupo.id}>
            <button 
              onClick={() => toggleGroup(grupo.id)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2 hover:text-slate-300 transition-colors"
            >
              <span>{grupo.title}</span>
              <span className={`transform transition-transform duration-200 ${openGroups[grupo.id] ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
            
            <div className={`space-y-1 overflow-hidden transition-all duration-300 ${openGroups[grupo.id] ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              {grupo.items.map(item => <Item key={item.id} item={item} />)}
            </div>
          </div>
        ))}
      </nav>

      {/* Pie de sidebar fijado abajo */}
      <div className="mt-4 shrink-0 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between text-sm text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-probolsas-navy flex items-center justify-center text-white text-xs font-bold uppercase shadow-sm">
              {user?.nombre?.slice(0, 2) || '??'}
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-white text-xs truncate max-w-[100px]">{user?.nombre}</span>
              <span className="text-[10px] text-slate-500 capitalize">{user?.rol}</span>
            </div>
          </div>
          <button onClick={logout} className="text-xs font-semibold text-probolsas-cyan hover:text-white hover:bg-slate-800 rounded-lg transition-colors duration-200 p-2">
            Salir
          </button>
        </div>
      </div>

    </aside>
  );
}
