import { createContext, useContext } from 'react';
import { type Usuario } from '../../services/api';

interface AuthContextType {
  user: Usuario | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({ user: null, logout: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}
