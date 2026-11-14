// Per-device settings (not secrets): kept in SecureStore on phones, localStorage on the web.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'royal-vpn.prefs';

export type Prefs = {
  killSwitch: boolean;
  lockdown: boolean;
  blockAds: boolean;
  autoConnect: boolean;
  excludedApps: string[];
  favorites: Record<string, boolean>;
  serverId: string | null;
};

export const DEFAULT_PREFS: Prefs = {
  killSwitch: true,
  lockdown: false,
  blockAds: false,
  autoConnect: false,
  excludedApps: [],
  favorites: {},
  serverId: null,
};

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = Platform.OS === 'web' ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(p: Prefs): Promise<void> {
  try {
    const raw = JSON.stringify(p);
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Settings just won't survive a restart.
  }
}
