import { create } from 'zustand';
import { api, ApiError, type Server } from '../lib/api';
import { vpn, deviceName, platformName, DEFAULT_BLOCKING_DNS } from '../lib/vpn';
import { loadPrefs, savePrefs, DEFAULT_PREFS, type Prefs } from '../lib/prefs';

type Status = 'disconnected' | 'connecting' | 'connected';

type VpnState = Prefs & {
  ready: boolean;
  servers: Server[];
  serversLoading: boolean;
  serversError: string | null;

  status: Status;
  connectedAt: number | null;
  connectedServerId: string | null;
  error: string | null;
  needsUpgrade: boolean;
  guardActive: boolean;
  // A setting that only applies on the next connection changed while connected.
  reconnectHint: boolean;

  init: () => Promise<void>;
  loadServers: () => Promise<void>;
  selectServer: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => void;
  toggleConnect: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  setKillSwitch: (on: boolean) => Promise<void>;
  setLockdown: (on: boolean) => Promise<void>;
  setBlockAds: (on: boolean) => void;
  setAutoConnect: (on: boolean) => void;
  setExcludedApps: (apps: string[]) => void;
  reset: () => Promise<void>;
};

function bestServer(servers: Server[]): Server | undefined {
  const up = servers.filter((s) => s.status === 'AVAILABLE');
  return [...up].sort((a, b) => (a.loadPct ?? 100) - (b.loadPct ?? 100))[0] ?? servers.find((s) => s.live);
}

const prefKeys = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];

let unsubscribe: (() => void) | null = null;

export const useVpnStore = create<VpnState>((set, get) => {
  const persist = () => {
    const s = get();
    void savePrefs(Object.fromEntries(prefKeys.map((k) => [k, s[k]])) as Prefs);
  };
  const update = (patch: Partial<VpnState>, { applyOnReconnect = false } = {}) => {
    set({ ...patch, ...(applyOnReconnect && get().status === 'connected' ? { reconnectHint: true } : {}) });
    persist();
  };

  return {
    ...DEFAULT_PREFS,
    ready: false,
    servers: [],
    serversLoading: false,
    serversError: null,
    status: 'disconnected',
    connectedAt: null,
    connectedServerId: null,
    error: null,
    needsUpgrade: false,
    guardActive: false,
    reconnectHint: false,

    init: async () => {
      if (get().ready) return;
      const prefs = await loadPrefs();
      const active = await vpn.isActive();
      set({ ...prefs, ready: true, status: active ? 'connected' : 'disconnected', connectedAt: active ? Date.now() : null, connectedServerId: active ? prefs.serverId : null, guardActive: await vpn.isGuardActive() });
      await vpn.setKillSwitch(prefs.killSwitch);

      unsubscribe?.();
      unsubscribe = vpn.onState(async (e) => {
        if (e.state === 'down' && e.unexpected) {
          const guard = await vpn.isGuardActive();
          set({
            status: 'disconnected', connectedAt: null, connectedServerId: null, guardActive: guard,
            error: guard ? 'Connection lost. Kill Switch is blocking traffic until you reconnect.' : 'Connection lost. Tap Connect to reconnect.',
          });
        }
      });

      if (prefs.autoConnect && !active && vpn.available) {
        await get().loadServers();
        await get().connect();
      }
    },

    loadServers: async () => {
      set({ serversLoading: true, serversError: null });
      try {
        const { servers } = await api<{ servers: Server[] }>('/servers', { auth: false });
        const current = get().serverId;
        const keep = current && servers.some((s) => s.id === current && s.live);
        set({ servers, serversLoading: false, serverId: keep ? current : bestServer(servers)?.id ?? null });
        if (!keep) persist();
      } catch (e: any) {
        set({ serversLoading: false, serversError: e?.message || 'Could not load servers.' });
      }
    },

    selectServer: async (id) => {
      const s = get().servers.find((x) => x.id === id);
      if (!s || !s.live) return;
      update({ serverId: id, error: null, needsUpgrade: false });
      // Already connected somewhere else: move the tunnel to the new server.
      if (get().status === 'connected' && get().connectedServerId !== id) await get().connect();
    },

    toggleFavorite: (id) => update({ favorites: { ...get().favorites, [id]: !get().favorites[id] } }),

    toggleConnect: async () => {
      const { status } = get();
      if (status === 'connecting') return;
      if (status === 'connected') return get().disconnect();
      return get().connect();
    },

    connect: async () => {
      const { serverId, blockAds, excludedApps } = get();
      if (get().status === 'connecting') return;
      if (!vpn.available) return set({ error: vpn.unavailableReason, needsUpgrade: false });
      if (!serverId) return set({ error: 'No server is available right now. Please try again shortly.' });
      set({ status: 'connecting', error: null, needsUpgrade: false, reconnectHint: false });
      try {
        if (!(await vpn.requestPermission())) throw new ApiError('Allow Royal-VPN to set up a VPN connection to continue.', 0);
        const publicKey = await vpn.getPublicKey();
        const cfg = await api<{ endpoint: string; serverPublicKey: string; clientAddress: string; dns: string; blockingDns: string | null }>('/vpn/server-config', {
          method: 'POST',
          body: { publicKey, serverId, deviceName: deviceName(), platform: platformName() },
        });
        const dns = blockAds ? cfg.blockingDns || DEFAULT_BLOCKING_DNS : cfg.dns;
        if (!(await vpn.start({ ...cfg, dns }, excludedApps))) throw new ApiError('The secure connection could not start. Please try again.', 0);
        set({ status: 'connected', connectedAt: Date.now(), connectedServerId: serverId, guardActive: false });
      } catch (e: any) {
        const guard = await vpn.isGuardActive();
        set({ status: 'disconnected', connectedAt: null, connectedServerId: null, guardActive: guard, error: e?.message || 'Could not connect.', needsUpgrade: Boolean(e?.upgrade) });
      }
    },

    disconnect: async () => {
      const lockdown = get().lockdown;
      await vpn.stop(lockdown);
      set({ status: 'disconnected', connectedAt: null, connectedServerId: null, reconnectHint: false, guardActive: lockdown ? await vpn.isGuardActive() : false });
    },

    clearError: () => set({ error: null, needsUpgrade: false }),

    setKillSwitch: async (on) => {
      update({ killSwitch: on });
      await vpn.setKillSwitch(on);
      if (!on) set({ guardActive: await vpn.isGuardActive() });
    },

    setLockdown: async (on) => {
      update({ lockdown: on });
      if (get().status === 'connected') return;
      if (on) await vpn.startGuard();
      else await vpn.stopGuard();
      // The guard service starts asynchronously.
      setTimeout(async () => set({ guardActive: await vpn.isGuardActive() }), 800);
    },

    setBlockAds: (on) => update({ blockAds: on }, { applyOnReconnect: true }),
    setAutoConnect: (on) => update({ autoConnect: on }),
    setExcludedApps: (apps) => update({ excludedApps: apps }, { applyOnReconnect: true }),

    reset: async () => {
      await vpn.stop(false);
      await vpn.stopGuard();
      set({ status: 'disconnected', connectedAt: null, connectedServerId: null, error: null, needsUpgrade: false, guardActive: false, reconnectHint: false });
    },
  };
});

export function useSelectedServer() {
  return useVpnStore((s) => s.servers.find((x) => x.id === s.serverId) ?? null);
}

export function fmtDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}
