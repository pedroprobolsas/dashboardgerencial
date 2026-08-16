import { useState, useEffect } from 'react';
import { useAuth } from '../Auth/AuthContext';

export default function Usuarios() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.rol !== 'admin') return;
    fetch('/api/usuarios')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setUsuarios(data.usuarios);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (user?.rol !== 'admin') {
    return (
      <div className="max-w-5xl mx-auto py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl">
          <h2 className="font-bold text-lg mb-2">Acceso Denegado</h2>
          <p>No tienes permisos para ver esta sección.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Gestión de Usuarios</h2>
          <p className="text-slate-500 mt-2">Administra los accesos y roles del sistema.</p>
        </div>
        <button className="bg-probolsas-navy text-white px-4 py-2 rounded-xl font-semibold shadow-sm hover:bg-probolsas-navy/90">
          + Nuevo Usuario
        </button>
      </header>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Último Acceso</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-500 animate-pulse">Cargando usuarios...</td></tr>
            ) : usuarios.map(u => (
              <tr key={u.id}>
                <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">{u.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-slate-500">{u.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.rol === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'}`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-slate-500 text-sm">
                  {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-CO') : 'Nunca'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
