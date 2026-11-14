// The device's VPN tunnel. Android uses the built-in WireGuard module (modules/royal-vpn-android);
// on web and iOS `available` is false and the app says so instead of pretending to connect.
import { Platform } from 'react-native';
import RoyalVpn, { type InstalledApp, type TunnelStateEvent } from '../../modules/royal-vpn-android/src/RoyalVpnAndroidModule';

export type { InstalledApp, TunnelStateEvent };
export type TunnelConfig = { serverPublicKey: string; endpoint: string; clientAddress: string; dns: string };

// Public resolver that filters ads, trackers and malware domains, used when "Block ads & trackers" is on
// and the exit server doesn't offer its own blocking DNS.
export const DEFAULT_BLOCKING_DNS = '94.140.14.14'; // AdGuard DNS

const native = Platform.OS === 'android' ? RoyalVpn : null;

export const vpn = {
  available: Boolean(native),
  unavailableReason:
    Platform.OS === 'web'
      ? 'Browsers can’t run a VPN. Install the Royal-VPN Android app to connect.'
      : Platform.OS === 'ios'
        ? 'Royal-VPN for iPhone is coming soon. Use the Android app to connect today.'
        : 'This build of Royal-VPN can’t start a VPN. Install the Royal-VPN app from the official download.',

  getPublicKey: () => native!.getPublicKeyAsync(),
  requestPermission: async () => (native ? native.requestPermissionAsync() : false),
  start: async (c: TunnelConfig, excludedApps: string[]) =>
    native ? native.startTunnelAsync(c.serverPublicKey, c.endpoint, c.clientAddress, c.dns, excludedApps) : false,
  stop: async (lockdown = false) => { if (native) await native.stopTunnelAsync(lockdown); },
  isActive: async () => (native ? native.isActive().catch(() => false) : false),
  stats: async () => (native ? native.getStatisticsAsync() : { rxBytes: 0, txBytes: 0 }),
  setKillSwitch: async (on: boolean) => { if (native) await native.setKillSwitchAsync(on); },
  startGuard: async () => (native ? native.startGuardAsync() : false),
  stopGuard: async () => { if (native) await native.stopGuardAsync(); },
  isGuardActive: async () => (native ? native.isGuardActive() : false),
  installedApps: async (): Promise<InstalledApp[]> => (native ? native.getInstalledAppsAsync() : []),
  openSystemVpnSettings: async () => (native ? native.openVpnSettingsAsync() : false),
  onState: (fn: (e: TunnelStateEvent) => void) => {
    const sub = native?.addListener('onTunnelState', fn);
    return () => sub?.remove();
  },
};

export function platformName(): string {
  return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
}

export function deviceName(): string {
  if (Platform.OS === 'android') {
    const c = (Platform as any).constants || {};
    const model = [c.Manufacturer, c.Model].filter(Boolean).join(' ');
    return model ? model.replace(/^(\w)/, (m) => m.toUpperCase()) : `Android ${Platform.Version}`;
  }
  if (Platform.OS === 'ios') return 'iPhone';
  return 'Web browser';
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
