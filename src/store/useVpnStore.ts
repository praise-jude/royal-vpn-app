import { create } from 'zustand';
import { SERVERS, DEVICES } from '../data/servers';

type VpnState = {
  connected: boolean;
  connecting: boolean;
  seconds: number;
  serverId: string;
  killSwitch: boolean;
  autoConnect: boolean;
  twoFA: boolean;
  favorites: Record<string, boolean>;
  signedOutDevices: Record<number, boolean>;

  toggleConnect: () => void;
  tick: () => void;
  selectServer: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleKillSwitch: () => void;
  toggleAutoConnect: () => void;
  toggle2FA: () => void;
  signOutDevice: (id: number) => void;
};

export const useVpnStore = create<VpnState>((set, get) => ({
  connected: true,
  connecting: false,
  seconds: 2538,
  serverId: 'lagos',
  killSwitch: true,
  autoConnect: true,
  twoFA: false,
  favorites: { london: true },
  signedOutDevices: {},

  toggleConnect: () => {
    const { connecting, connected } = get();
    if (connecting) return;
    if (connected) {
      set({ connected: false, seconds: 0 });
    } else {
      set({ connecting: true });
      setTimeout(() => set({ connecting: false, connected: true }), 1400);
    }
  },
  tick: () => {
    if (get().connected) set((s) => ({ seconds: s.seconds + 1 }));
  },
  selectServer: (id) => set({ serverId: id }),
  toggleFavorite: (id) =>
    set((s) => ({ favorites: { ...s.favorites, [id]: !s.favorites[id] } })),
  toggleKillSwitch: () => set((s) => ({ killSwitch: !s.killSwitch })),
  toggleAutoConnect: () => set((s) => ({ autoConnect: !s.autoConnect })),
  toggle2FA: () => set((s) => ({ twoFA: !s.twoFA })),
  signOutDevice: (id) =>
    set((s) => ({ signedOutDevices: { ...s.signedOutDevices, [id]: true } })),
}));

export function useSelectedServer() {
  const serverId = useVpnStore((s) => s.serverId);
  return SERVERS.find((s) => s.id === serverId) ?? SERVERS[0];
}

export function useVisibleDevices() {
  const signedOut = useVpnStore((s) => s.signedOutDevices);
  return DEVICES.filter((d) => !signedOut[d.id]);
}

export function fmtDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}
