import { create } from 'zustand';
import { api, tokenStore, setUnauthorizedHandler, type User } from '../lib/api';

type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, refCode?: string) => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,

  restore: async () => {
    const token = await tokenStore.get();
    if (!token) return set({ status: 'signedOut', user: null });
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      set({ status: 'signedIn', user });
    } catch {
      // Expired session (401) or offline: show sign-in. The saved token is only cleared on a real 401.
      set({ status: 'signedOut', user: null });
    }
  },

  signIn: async (email, password) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    await tokenStore.set(r.token);
    set({ status: 'signedIn', user: r.user });
  },

  signUp: async (email, password, refCode) => {
    const r = await api<{ token: string; user: User }>('/auth/signup', { method: 'POST', body: { email, password, refCode: refCode || undefined }, auth: false });
    await tokenStore.set(r.token);
    set({ status: 'signedIn', user: r.user });
  },

  refresh: async () => {
    if (get().status !== 'signedIn') return;
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      set({ user });
    } catch { /* keep what we have */ }
  },

  setUser: (user) => set({ user }),

  signOut: async () => {
    await tokenStore.clear();
    set({ status: 'signedOut', user: null });
  },
}));

setUnauthorizedHandler(() => { void useAuthStore.getState().signOut(); });
