import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api, setCurrentUserId } from '../services/api';

export interface UserProfile {
  id: number;
  displayName: string;
  organization: string;
  avatarUrl: string;
}

interface AuthContextType {
  /** All available users */
  users: UserProfile[];
  /** Currently selected user (null = show user picker) */
  currentUser: UserProfile | null;
  /** Select a user profile */
  selectUser: (userId: number) => void;
  /** Switch back to user picker */
  switchUser: () => void;
  /** Create a new user profile */
  createUser: (data: { displayName: string; organization?: string; avatarUrl?: string }) => Promise<UserProfile>;
  /** Update a user profile */
  updateUser: (userId: number, updates: Partial<UserProfile>) => Promise<void>;
  /** Delete a user profile */
  deleteUser: (userId: number) => Promise<void>;
  /** Loading state */
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_ID_KEY = 'axiome_user_id';

function mapUser(u: any): UserProfile {
  return {
    id: u.id,
    displayName: u.display_name || 'User',
    organization: u.organization || '',
    avatarUrl: u.avatar_url || '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: load users with retry logic (sidecar may not be ready yet)
  useEffect(() => {
    let cancelled = false;
    const MAX_RETRIES = 8;
    const BASE_DELAY = 500; // ms

    async function loadUsers(attempt: number) {
      try {
        const list: any[] = await api.users.list();
        if (cancelled) return;
        const mapped = list.map(mapUser);
        setUsers(mapped);

        // Auto-select last used user
        const savedId = localStorage.getItem(USER_ID_KEY);
        if (savedId) {
          const found = mapped.find(u => u.id === parseInt(savedId));
          if (found) {
            setCurrentUser(found);
            setCurrentUserId(found.id);
          }
        }
        setIsLoading(false);
      } catch (e) {
        console.warn(`Failed to load users (attempt ${attempt + 1}/${MAX_RETRIES})`, e);
        if (!cancelled && attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY * Math.pow(1.5, attempt);
          setTimeout(() => loadUsers(attempt + 1), delay);
        } else if (!cancelled) {
          console.error('All retries to load users exhausted');
          setIsLoading(false);
        }
      }
    }

    loadUsers(0);
    return () => { cancelled = true; };
  }, []);

  const selectUser = useCallback((userId: number) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem(USER_ID_KEY, String(user.id));
    }
  }, [users]);

  const switchUser = useCallback(() => {
    setCurrentUser(null);
    setCurrentUserId(null);
    localStorage.removeItem(USER_ID_KEY);
  }, []);

  const createUser = useCallback(async (data: { displayName: string; organization?: string; avatarUrl?: string }) => {
    const result = await api.users.create({
      display_name: data.displayName,
      organization: data.organization || '',
      avatar_url: data.avatarUrl || '',
    });
    const newUser = mapUser(result);
    setUsers(prev => [...prev, newUser]);
    // Auto-select the new user
    setCurrentUser(newUser);
    setCurrentUserId(newUser.id);
    localStorage.setItem(USER_ID_KEY, String(newUser.id));
    return newUser;
  }, []);

  const updateUser = useCallback(async (userId: number, updates: Partial<UserProfile>) => {
    const payload: Record<string, string> = {};
    if (updates.displayName !== undefined) payload.display_name = updates.displayName;
    if (updates.organization !== undefined) payload.organization = updates.organization;
    if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
    if (Object.keys(payload).length > 0) {
      await api.users.update(userId, payload);
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    setCurrentUser(prev => prev && prev.id === userId ? { ...prev, ...updates } : prev);
  }, []);

  const deleteUser = useCallback(async (userId: number) => {
    try {
      await api.users.delete(userId);
    } catch (e) {
      console.error('Failed to delete user', e);
      throw e; // re-throw so caller knows it failed
    }
    setUsers(prev => prev.filter(u => u.id !== userId));
    setCurrentUser(prev => {
      if (prev?.id === userId) {
        setCurrentUserId(null);
        localStorage.removeItem(USER_ID_KEY);
        return null;
      }
      return prev;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ users, currentUser, selectUser, switchUser, createUser, updateUser, deleteUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
