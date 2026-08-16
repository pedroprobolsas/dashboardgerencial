import { useState } from 'react';
import Sidebar, { type Vista } from './Sidebar';

interface Props {
  children: React.ReactNode;
  vistaActual: Vista;
  onNavegar: (vista: Vista) => void;
  pendientesAprobacion: number;
}

export default function Layout({ children, vistaActual, onNavegar, pendientesAprobacion }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  function navegar(vista: Vista) {
    onNavegar(vista);
    setMenuAbierto(false); // cierra el menú en móvil al navegar
  }

  return (
    <div className="flex min-h-screen bg-dashboard-canvas font-sans text-dashboard-textMain">

      {/* Overlay oscuro en móvil cuando el menú está abierto */}
      {menuAbierto && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      {/* Sidebar: siempre fixed */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out w-64
        lg:translate-x-0
        ${menuAbierto ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar vistaActual={vistaActual} onNavegar={navegar} pendientesAprobacion={pendientesAprobacion} />
      </div>

      {/* Contenido principal */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen lg:ml-64">
        {/* Barra superior móvil con botón hamburguesa */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-dashboard-sidebar text-white sticky top-0 z-30 shadow-md">
          <button
            onClick={() => setMenuAbierto(v => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Abrir menú"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold tracking-wider text-sm">Probolsas</span>
        </div>

        <div className="p-4 md:p-8 flex-1">
          {children}
        </div>
      </main>

    </div>
  );
}
