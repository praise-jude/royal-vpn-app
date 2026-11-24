// Talks to the Royal-VPN API. On the web the app and API share an origin; the phone apps call the live server.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = Platform.OS === 'web' ? '/api' : 'https://vpn.royalmancloud.com/api';
const TOKEN_KEY = 'royal-vpn.auth-token';

// SecureStore has no web support, so the browser build keeps the token in localStorage.
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
    }
    try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
  },
  async set(token: string) {
    if (Platform.OS === 'web') {
      try { window.localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode: session-only */ }
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear() {
    if (Platform.OS === 'web') {
      try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
      return;
    }
    try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* nothing stored */ }
  },
};

export type User = {
  email: string;
  planId: 'free' | 'weekly' | 'pro' | 'family' | 'vip';
  planName: string;
  planExpiresAt: string | null;
  deviceLimit: number;
  lifetime?: boolean;
  trial?: boolean;
  isAdmin?: boolean;
};

export type Server = {
  id: string;
  city: string;
  country: string;
  flag: string;
  vip: boolean;
  live: boolean;
  status: 'AVAILABLE' | 'OFFLINE' | 'COMING SOON';
  pingMs: number | null;
  loadPct: number | null;
  activeUsers: number | null;
};

export type Plan = { id: User['planId']; name: string; amountNaira: number; devices: number; days: number };

export type Device = {
  id: number;
  name: string;
  platform: string;
  serverId: string | null;
  createdAt: string;
  lastSeenAt: string;
  thisDevice: boolean;
};

export class ApiError extends Error {
  status: number;
  upgrade: boolean;
  constructor(message: string, status: number, upgrade = false) {
    super(message);
    this.status = status;
    this.upgrade = upgrade;
  }
}

// Called when the server says the session is no longer valid.
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

export async function api<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = opts.auth === false ? null : await tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('Could not reach Royal-VPN. Check your internet connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && opts.auth !== false) onUnauthorized();
    throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status, Boolean(data.upgrade));
  }
  return data as T;
}
