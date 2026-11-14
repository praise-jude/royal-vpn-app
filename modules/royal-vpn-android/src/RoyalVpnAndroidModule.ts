import { NativeModule, requireOptionalNativeModule } from 'expo';

export type TunnelStateEvent = { state: 'up' | 'down'; unexpected: boolean };
export type InstalledApp = { packageName: string; label: string };

declare class RoyalVpnAndroidModule extends NativeModule<{ onTunnelState: (e: TunnelStateEvent) => void }> {
  getPublicKeyAsync(): Promise<string>;
  requestPermissionAsync(): Promise<boolean>;
  startTunnelAsync(serverPublicKey: string, endpoint: string, clientAddress: string, dns: string, excludedApps: string[]): Promise<boolean>;
  stopTunnelAsync(lockdown: boolean): Promise<boolean>;
  isActive(): Promise<boolean>;
  getStatisticsAsync(): Promise<{ rxBytes: number; txBytes: number }>;
  setKillSwitchAsync(enabled: boolean): Promise<boolean>;
  startGuardAsync(): Promise<boolean>;
  stopGuardAsync(): Promise<boolean>;
  isGuardActive(): Promise<boolean>;
  getInstalledAppsAsync(): Promise<InstalledApp[]>;
  openVpnSettingsAsync(): Promise<boolean>;
}

// Null on web, iOS and Expo Go, where the native module isn't built in.
export default requireOptionalNativeModule<RoyalVpnAndroidModule>('RoyalVpnAndroid');
