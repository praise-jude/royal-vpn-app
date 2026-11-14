import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { vpn, type InstalledApp } from '../lib/vpn';
import { useVpnStore } from '../store/useVpnStore';
import ToggleSwitch from '../components/ToggleSwitch';

// Apps switched on here skip the VPN and use the normal connection (e.g. banking apps that block VPNs).
export default function SplitTunnelScreen() {
  const navigation = useNavigation<any>();
  const excluded = useVpnStore((s) => s.excludedApps);
  const setExcludedApps = useVpnStore((s) => s.setExcludedApps);
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => { vpn.installedApps().then(setApps).catch(() => setApps([])); }, []);

  const set = useMemo(() => new Set(excluded), [excluded]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps || [])
      .filter((a) => !q || a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q))
      .sort((a, b) => Number(set.has(b.packageName)) - Number(set.has(a.packageName)));
  }, [apps, query, set]);

  const toggle = (pkg: string) => setExcludedApps(set.has(pkg) ? excluded.filter((p) => p !== pkg) : [...excluded, pkg]);

  return (
    <View style={styles.screen}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityLabel="Back">
        <FontAwesome6 name="chevron-left" size={15} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title}>Split tunnelling</Text>
      <Text style={styles.subtitle}>Apps you switch on here skip the VPN and use your normal connection. Changes apply when you reconnect.</Text>

      <View style={styles.searchBar}>
        <FontAwesome6 name="magnifying-glass" size={13} color="rgba(255,255,255,0.4)" />
        <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search apps" placeholderTextColor="rgba(255,255,255,0.4)" autoCorrect={false} />
      </View>

      {!apps ? (
        <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(a) => a.packageName}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>{apps.length ? 'No apps match your search.' : 'No apps found on this device.'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.pkg} numberOfLines={1}>{set.has(item.packageName) ? 'Bypasses the VPN' : 'Uses the VPN'}</Text>
              </View>
              <ToggleSwitch value={set.has(item.packageName)} onToggle={() => toggle(item.packageName)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, backgroundColor: colors.bg },
  back: { width: 36, height: 36, borderRadius: 9999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 14, marginBottom: 14 },
  search: { flex: 1, paddingVertical: 10, fontFamily: font.regular, fontSize: 14, color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  label: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  pkg: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 30 },
});
