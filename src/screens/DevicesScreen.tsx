import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, RefreshControl, Alert, Platform, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { api, type Device } from '../lib/api';
import { vpn } from '../lib/vpn';

const ICONS: Record<string, string> = { android: 'android', ios: 'apple', macos: 'apple', windows: 'windows', web: 'globe' };

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 120) return 'Active now';
  if (s < 3600) return `Active ${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `Active ${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'Active yesterday' : `Active ${d} days ago`;
}

function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Sign out', style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

export default function DevicesScreen() {
  const navigation = useNavigation<any>();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const key = vpn.available ? await vpn.getPublicKey().catch(() => '') : '';
      const r = await api<{ deviceLimit: number; devices: Device[] }>(`/devices${key ? `?publicKey=${encodeURIComponent(key)}` : ''}`);
      setDevices(r.devices);
      setLimit(r.deviceLimit);
    } catch (e: any) {
      setError(e?.message || 'Could not load your devices.');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function signOut(d: Device) {
    if (!(await confirm(`Sign out ${d.name}?`, 'It loses VPN access right away and frees a device slot.'))) return;
    setRemoving(d.id);
    try {
      await api(`/devices/${d.id}`, { method: 'DELETE' });
      setDevices((list) => (list || []).filter((x) => x.id !== d.id));
    } catch (e: any) {
      setError(e?.message || 'Could not sign out that device.');
    } finally {
      setRemoving(null);
    }
  }

  const used = devices?.length ?? 0;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Devices</Text>
      <Text style={styles.subtitle}>
        {devices ? `${used} of ${limit} device${limit === 1 ? '' : 's'} on your plan` : 'Manage where you’re connected'}
      </Text>

      {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
      {!devices && !error && <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />}

      {devices && (
        <FlatList
          data={devices}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.orange} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <FontAwesome6 name="mobile-screen-button" size={26} color={colors.textFaint} />
              <Text style={styles.emptyText}>No devices yet. A device appears here the first time it connects.</Text>
            </View>
          }
          ListFooterComponent={
            devices.length >= limit && limit > 0 ? (
              <Pressable style={styles.upgrade} onPress={() => navigation.navigate('Plans')}>
                <FontAwesome6 name="crown" size={12} color={colors.orange} />
                <Text style={styles.upgradeText}>Need more devices? See plans</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <FontAwesome6 name={(ICONS[item.platform] || 'mobile-screen-button') as any} brand={item.platform !== 'web' && item.platform in ICONS} size={17} color={colors.orange} style={{ width: 22 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{ago(item.lastSeenAt)}</Text>
              </View>
              {item.thisDevice ? (
                <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>THIS DEVICE</Text></View>
              ) : removing === item.id ? (
                <ActivityIndicator color={colors.red} />
              ) : (
                <Pressable onPress={() => signOut(item)} hitSlop={8}>
                  <Text style={styles.signOut}>Sign Out</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: 14, marginBottom: 10 },
  name: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  sub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  currentBadge: { backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 },
  currentBadgeText: { fontFamily: font.bold, fontSize: 9, color: colors.green, letterSpacing: 0.5 },
  signOut: { fontFamily: font.semiBold, fontSize: 12, color: colors.red, paddingVertical: 6, paddingHorizontal: 8 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radii.md, padding: 12, marginBottom: 14 },
  errorText: { fontFamily: font.regular, fontSize: 13, color: '#FCA5A5' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  upgrade: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  upgradeText: { fontFamily: font.semiBold, fontSize: 13, color: colors.orange },
});
