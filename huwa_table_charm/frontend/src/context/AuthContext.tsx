import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setTokens } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await api.get<AuthUser>('/me');
      if (res.success && res.data) setUser(res.data);
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>('/login', { email, password });
    if (!res.success || !res.data) throw new Error(res.error || 'Login failed');
    setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
    setUser(res.data.user);
    // Merge anonymous cart into user's cart after login
    try {
      const { getAnonymousId } = await import('../lib/api');
      const anonId = getAnonymousId();
      await api.get(`/cart?anonymousId=${encodeURIComponent(anonId)}`);
    } catch { /* ignore — cart merge is best-effort */ }
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post<{ user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>('/register', { name, email, password });
    if (!res.success || !res.data) throw new Error(res.error || 'Registration failed');
    setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
    setUser(res.data.user);
  };

  const logout = async () => {
    const refresh = localStorage.getItem('htc_refresh');
    if (refresh) await api.post('/logout', { refreshToken: refresh });
    setTokens(null, null);
    setUser(null);
  };

  const isAdmin = !!user?.roles?.some((r) => ['admin', 'merchant', 'support'].includes(r));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
