import { create } from 'zustand';
import { api, ApiError, type Server } from '../lib/api';
import { vpn, deviceName, platformName } from '../lib/vpn';

type Status = 'disconnected' | 'connecting' | 'connected';

type VpnState = {
  servers: Server[];
  serversLoading: boolean;
  serversError: string | null;
  serverId: string | null;
  favorites: Record<string, boolean>;

  status: Status;
  connectedAt: number | null;
  error: string | null;
  needsUpgrade: boolean;

  killSwitch: boolean;
  autoConnect: boolean;

  loadServers: () => Promise<void>;
  selectServer: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleConnect: () => Promise<void>;
  clearError: () => void;
  toggleKillSwitch: () => void;
  toggleAutoConnect: () => void;
  reset: () => void;
};

// Pick the live server with the lowest ping, falling back to the first live one.
function bestServer(servers: Server[]): Server | undefined {
  const up = servers.filter((s) => s.status === 'AVAILABLE');
  return [...up].sort((a, b) => (a.pingMs ?? 9e9) - (b.pingMs ?? 9e9))[0] ?? servers.find((s) => s.live);
}

export const useVpnStore = create<VpnState>((set, get) => ({
  servers: [],
  serversLoading: false,
  serversError: null,
  serverId: null,
  favorites: {},

  status: 'disconnected',
  connectedAt: null,
  error: null,
  needsUpgrade: false,

  killSwitch: false,
  autoConnect: false,

  loadServers: async () => {
    set({ serversLoading: true, serversError: null });
    try {
      const { servers } = await api<{ servers: Server[] }>('/servers', { auth: false });
      const current = get().serverId;
      const keep = current && servers.some((s) => s.id === current && s.live);
      set({ servers, serversLoading: false, serverId: keep ? current : bestServer(servers)?.id ?? null });
    } catch (e: any) {
      set({ serversLoading: false, serversError: e?.message || 'Could not load servers.' });
    }
  },

  selectServer: (id) => {
    const s = get().servers.find((x) => x.id === id);
    if (!s || !s.live) return;
    set({ serverId: id, error: null, needsUpgrade: false });
  },

  toggleFavorite: (id) => set((s) => ({ favorites: { ...s.favorites, [id]: !s.favorites[id] } })),

  toggleConnect: async () => {
    const { status, serverId } = get();
    if (status === 'connecting') return;
    if (status === 'connected') {
      await vpn.stop();
      return set({ status: 'disconnected', connectedAt: null });
    }
    if (!vpn.available) return set({ error: vpn.unavailableReason, needsUpgrade: false });
    if (!serverId) return set({ error: 'No server is available right now. Please try again shortly.' });

    set({ status: 'connecting', error: null, needsUpgrade: false });
    try {
      if (!(await vpn.requestPermission())) throw new ApiError('Allow Royal-VPN to set up a VPN connection to continue.', 0);
      const publicKey = await vpn.getPublicKey();
      const cfg = await api<{ endpoint: string; serverPublicKey: string; clientAddress: string; dns: string }>('/vpn/server-config', {
        method: 'POST',
        body: { publicKey, serverId, deviceName: deviceName(), platform: platformName() },
      });
      if (!(await vpn.start(cfg))) throw new ApiError('The secure connection could not start. Please try again.', 0);
      set({ status: 'connected', connectedAt: Date.now() });
    } catch (e: any) {
      set({ status: 'disconnected', connectedAt: null, error: e?.message || 'Could not connect.', needsUpgrade: Boolean(e?.upgrade) });
    }
  },

  clearError: () => set({ error: null, needsUpgrade: false }),
  toggleKillSwitch: () => set((s) => ({ killSwitch: !s.killSwitch })),
  toggleAutoConnect: () => set((s) => ({ autoConnect: !s.autoConnect })),

  reset: () => {
    void vpn.stop();
    set({ status: 'disconnected', connectedAt: null, error: null, needsUpgrade: false });
  },
}));

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
