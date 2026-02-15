import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '../services/api';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  displayName: string;
  organization: string;
  avatarUrl: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<UserProfile, 'displayName' | 'organization' | 'avatarUrl' | 'email'>>) => void;
  changePassword: (current: string, newPw: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function profileFromBackend(u: any): UserProfile {
  return {
    id: u.id,
    username: u.username,
    email: u.email ?? `${u.username}@example.com`,
    role: (u.role === 'admin' || u.is_superuser) ? 'admin' : 'user',
    displayName: u.display_name || u.username.charAt(0).toUpperCase() + u.username.slice(1),
    organization: u.organization || '',
    avatarUrl: u.avatar_url || '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);

  // On mount: if token exists, fetch /me
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    api.users.me()
      .then((u: any) => setUser(profileFromBackend(u)))
      .catch(() => {
        // Token expired / invalid — clear
        localStorage.removeItem('access_token');
        setUser(null);
      });
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const data = await api.auth.login(username, password);
      localStorage.setItem('access_token', data.access_token);
      // Fetch real profile
      try {
        const me = await api.users.me();
        setUser(profileFromBackend(me));
      } catch {
        // Fallback if /me fails
        setUser({
          id: 0, username, email: `${username}@example.com`,
          role: 'user', displayName: username, organization: '', avatarUrl: '',
        });
      }
      return true;
    } catch (error) {
      console.error('Login failed', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Pick<UserProfile, 'displayName' | 'organization' | 'avatarUrl' | 'email'>>) => {
      // Persist all profile fields to backend
      try {
        const payload: Record<string, string> = {};
        if (updates.email) payload.email = updates.email;
        if (updates.displayName !== undefined) payload.display_name = updates.displayName;
        if (updates.organization !== undefined) payload.organization = updates.organization;
        if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
        if (Object.keys(payload).length > 0) {
          await api.users.updateMe(payload);
        }
      } catch (e) { console.error('Profile update failed', e); }
      // Update local state
      setUser(prev => (prev ? { ...prev, ...updates } : null));
    },
    []
  );

  const changePassword = useCallback(async (current: string, newPw: string): Promise<boolean> => {
    try {
      await api.users.changePassword(current, newPw);
      return true;
    } catch (e) {
      console.error('Password change failed', e);
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        login,
        logout,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
