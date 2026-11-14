// The device's VPN tunnel. A real WireGuard tunnel needs the native Android module (added in the next step);
// until then, and on web and iOS, `available` is false and the app says so instead of pretending to connect.
import { Platform } from 'react-native';

export type TunnelConfig = { serverPublicKey: string; endpoint: string; clientAddress: string; dns: string };

export type VpnEngine = {
  available: boolean;
  unavailableReason: string;
  getPublicKey(): Promise<string>;
  requestPermission(): Promise<boolean>;
  start(config: TunnelConfig): Promise<boolean>;
  stop(): Promise<void>;
  isActive(): Promise<boolean>;
};

const unavailable: VpnEngine = {
  available: false,
  unavailableReason: Platform.OS === 'web'
    ? 'Browsers can’t run a VPN. Install the Royal-VPN Android app to connect.'
    : 'Secure connections are coming to this device soon.',
  async getPublicKey() { throw new Error('VPN not available on this device'); },
  async requestPermission() { return false; },
  async start() { return false; },
  async stop() {},
  async isActive() { return false; },
};

export const vpn: VpnEngine = unavailable;

export function platformName(): string {
  return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
}

export function deviceName(): string {
  if (Platform.OS === 'android') return `Android ${Platform.Version}`;
  if (Platform.OS === 'ios') return `iPhone (iOS ${Platform.Version})`;
  return 'Web browser';
}
