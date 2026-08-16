import { useState, useEffect } from 'react';
import { useAuth } from '../Auth/AuthContext';
import { fetchUsuarios, createUsuario, updateUsuario, resetPassword } from '../../services/api';

export default function Usuarios() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados del modal de crear usuario
  const [showModal, setShowModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRol, setFormRol] = useState<'admin' | 'usuario'>('usuario');
  const [formPassword, setFormPassword] = useState('');

  // Estados del modal de resetear password
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  useEffect(() => {
    if (user?.rol !== 'admin') return;
    cargar();
  }, [user]);

  function cargar() {
    setLoading(true);
    fetchUsuarios()
      .then(data => setUsuarios(data))
      .catch(err => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }

  async function handleToggleActivo(id: number, currentActivo: boolean) {
    try {
      await updateUsuario(id, { activo: !currentActivo });
      cargar();
    } catch (err: any) {
      alert(`Error al cambiar estado: ${err.message}`);
    }
  }

  async function handleToggleRol(id: number, currentRol: string) {
    const nuevoRol = currentRol === 'admin' ? 'usuario' : 'admin';
    try {
      await updateUsuario(id, { rol: nuevoRol });
      cargar();
    } catch (err: any) {
      alert(`Error al cambiar rol: ${err.message}`);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (formPassword.length < 8 || !/[a-zA-Z]/.test(formPassword) || !/[0-9]/.test(formPassword)) {
      alert('La contraseña debe tener al menos 8 caracteres, e incluir letras y números.');
      return;
    }
    setFormLoading(true);
    try {
      await createUsuario({
        email: formEmail,
        nombre: formNombre,
        rol: formRol,
        password: formPassword
      });
      setShowModal(false);
      setFormNombre('');
      setFormEmail('');
      setFormPassword('');
      cargar();
    } catch (err: any) {
      alert(`Error al crear usuario: ${err.message}`);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    if (resetPasswordVal.length < 8 || !/[a-zA-Z]/.test(resetPasswordVal) || !/[0-9]/.test(resetPasswordVal)) {
      alert('La contraseña debe tener al menos 8 caracteres, e incluir letras y números.');
      return;
    }
    setFormLoading(true);
    try {
      await resetPassword(resetUserId, resetPasswordVal);
      setResetUserId(null);
      setResetPasswordVal('');
      alert('Contraseña actualizada correctamente.');
    } catch (err: any) {
      alert(`Error al resetear contraseña: ${err.message}`);
    } finally {
      setFormLoading(false);
    }
  }

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
        <button 
          onClick={() => setShowModal(true)}
          className="bg-probolsas-navy text-white px-4 py-2 rounded-xl font-semibold shadow-sm hover:bg-probolsas-navy/90 transition-colors"
        >
          + Nuevo Usuario
        </button>
      </header>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-4 border border-red-200">
          {errorMsg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Último Acceso</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 animate-pulse font-medium">Cargando usuarios...</td></tr>
              ) : usuarios.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">{u.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">{u.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                      onClick={() => handleToggleRol(u.id, u.rol)}
                      className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full border hover:opacity-80 transition-opacity ${u.rol === 'admin' ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}
                      title="Haz clic para cambiar el rol"
                    >
                      {u.rol}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                      onClick={() => handleToggleActivo(u.id, u.activo)}
                      className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full border hover:opacity-80 transition-opacity ${u.activo ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-red-100 text-red-800 border-red-200'}`}
                      title="Haz clic para activar/desactivar"
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-slate-500 text-sm">
                    {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-CO') : 'Nunca'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => setResetUserId(u.id)}
                      className="text-probolsas-cyan hover:text-cyan-700 bg-sky-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear Usuario */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">Nuevo Usuario</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre completo</label>
                <input required type="text" value={formNombre} onChange={e => setFormNombre(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-probolsas-cyan focus:border-probolsas-cyan sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                <input required type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-probolsas-cyan focus:border-probolsas-cyan sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Rol</label>
                <select value={formRol} onChange={e => setFormRol(e.target.value as any)} className="w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-probolsas-cyan focus:border-probolsas-cyan sm:text-sm bg-white">
                  <option value="usuario">Usuario (Solo lectura configuraciones)</option>
                  <option value="admin">Admin (Acceso total)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña temporal</label>
                <input required type="text" value={formPassword} onChange={e => setFormPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-probolsas-cyan focus:border-probolsas-cyan sm:text-sm" placeholder="Mínimo 8 caracteres, alfanumérica" />
              </div>
              <div className="pt-4">
                <button disabled={formLoading} type="submit" className="w-full bg-probolsas-navy text-white rounded-xl py-2.5 font-semibold hover:bg-probolsas-navy/90 disabled:opacity-50 transition-colors">
                  {formLoading ? 'Guardando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetUserId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full overflow-hidden border border-slate-100">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">Resetear Contraseña</h3>
              <button onClick={() => setResetUserId(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleResetSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nueva contraseña</label>
                <input required type="text" value={resetPasswordVal} onChange={e => setResetPasswordVal(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm focus:ring-probolsas-cyan focus:border-probolsas-cyan sm:text-sm" placeholder="Mínimo 8 caracteres, alfanumérica" />
              </div>
              <div className="pt-2">
                <button disabled={formLoading} type="submit" className="w-full bg-emerald-600 text-white rounded-xl py-2.5 font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {formLoading ? 'Guardando...' : 'Guardar nueva contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
