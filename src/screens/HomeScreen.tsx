import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { useVpnStore, useSelectedServer, fmtDuration } from '../store/useVpnStore';
import { vpn, fmtBytes } from '../lib/vpn';
import { useAuthStore } from '../store/useAuthStore';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const status = useVpnStore((s) => s.status);
  const connectedAt = useVpnStore((s) => s.connectedAt);
  const error = useVpnStore((s) => s.error);
  const needsUpgrade = useVpnStore((s) => s.needsUpgrade);
  const killSwitch = useVpnStore((s) => s.killSwitch);
  const blockAds = useVpnStore((s) => s.blockAds);
  const guardActive = useVpnStore((s) => s.guardActive);
  const serversLoading = useVpnStore((s) => s.serversLoading);
  const toggleConnect = useVpnStore((s) => s.toggleConnect);
  const clearError = useVpnStore((s) => s.clearError);
  const setKillSwitch = useVpnStore((s) => s.setKillSwitch);
  const setBlockAds = useVpnStore((s) => s.setBlockAds);
  const server = useSelectedServer();
  const user = useAuthStore((s) => s.user);
  const free = !user || user.planId === 'free';
  const trialDaysLeft = user?.trial && user.planExpiresAt ? Math.max(0, Math.ceil((new Date(user.planExpiresAt).getTime() - Date.now()) / 86400000)) : null;

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  // Tick every second while connected: moves the timer and refreshes the data counters.
  const [traffic, setTraffic] = useState({ rxBytes: 0, txBytes: 0 });
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      setNow((n) => n + 1);
      vpn.stats().then(setTraffic).catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [connected]);
  const seconds = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : 0;

  // Real latency from this phone, through the tunnel: time a tiny request to Cloudflare every 10 s.
  const [latency, setLatency] = useState<number | null>(null);
  useEffect(() => {
    if (!connected) return setLatency(null);
    let alive = true;
    const measure = async () => {
      const started = Date.now();
      try {
        await fetch(`https://1.1.1.1/cdn-cgi/trace?t=${started}`, { cache: 'no-store' });
        if (alive) setLatency(Date.now() - started);
      } catch {
        if (alive) setLatency(null);
      }
    };
    void measure();
    const id = setInterval(measure, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [connected]);

  const btnBg = connecting ? '#4B5563' : connected ? colors.blue : colors.orange;
  const label = connecting ? 'Connecting…' : connected ? 'PROTECTED' : 'CONNECT';
  const statusLine = connecting ? 'Securing your connection…' : connected ? 'Your connection is protected' : guardActive ? 'Traffic blocked until you reconnect' : 'You are not protected';
  const statusDot = connected ? colors.green : connecting || guardActive ? colors.yellow : colors.red;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.header}>
        <FontAwesome6 name="shield-halved" size={20} color={colors.orange} />
        <Text style={styles.title}>ROYAL-VPN</Text>
      </View>

      {(free || trialDaysLeft !== null) && (
        <Pressable style={styles.promo} onPress={() => navigation.navigate('Plans')}>
          <FontAwesome6 name="crown" size={13} color={colors.orange} />
          <Text style={styles.promoText}>
            {trialDaysLeft !== null ? `Free Pro trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left. Keep Pro from ₦1,500/week` : 'Free plan · Get Pro for more devices & ad blocking'}
          </Text>
          <FontAwesome6 name="chevron-right" size={11} color={colors.orange} />
        </Pressable>
      )}

      <View style={styles.connectWrap}>
        <Pressable
          onPress={toggleConnect}
          disabled={connecting}
          accessibilityRole="button"
          accessibilityLabel={connected ? 'Disconnect' : 'Connect'}
          style={[styles.connectBtn, { backgroundColor: btnBg }]}
        >
          <FontAwesome6 name="power-off" size={38} color="#fff" />
          <Text style={styles.connectLabel}>{label}</Text>
        </Pressable>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusDot }]} />
          <Text style={styles.statusText}>{statusLine}</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <FontAwesome6 name="circle-info" size={14} color={colors.orange} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorText}>{error}</Text>
            {needsUpgrade && (
              <Pressable onPress={() => { clearError(); navigation.navigate('Plans'); }}>
                <Text style={styles.errorLink}>See plans</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={clearError} hitSlop={10} accessibilityLabel="Dismiss">
            <FontAwesome6 name="xmark" size={13} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <Pressable style={styles.serverRow} onPress={() => navigation.navigate('Servers')}>
        {server ? <Text style={styles.flag}>{server.flag}</Text> : <FontAwesome6 name="globe" size={19} color={colors.orange} style={{ width: 22 }} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.serverCity}>
            {server ? `${server.city}, ${server.country}` : serversLoading ? 'Finding the best server…' : 'No server available'}
          </Text>
          <Text style={styles.serverHint}>Tap to change server</Text>
        </View>
        <FontAwesome6 name="chevron-right" size={13} color={colors.textFaint} />
      </Pressable>

      {connected && (
        <View style={styles.statsGrid}>
          <StatTile label="DURATION" value={fmtDuration(seconds)} />
          <StatTile label="LATENCY" value={latency != null ? `${latency} ms` : '—'} />
          <StatTile label="PROTOCOL" value="WireGuard" />
        </View>
      )}
      {connected && (
        <View style={styles.statsGrid}>
          <StatTile label="DOWNLOADED" value={fmtBytes(traffic.rxBytes)} />
          <StatTile label="UPLOADED" value={fmtBytes(traffic.txBytes)} />
        </View>
      )}

      {vpn.available && (
        <View style={styles.quickRow}>
          <Pressable style={styles.quickChip} onPress={() => setKillSwitch(!killSwitch)}>
            <FontAwesome6 name="power-off" size={12} color={colors.orange} />
            <Text style={styles.quickLabel}>Kill Switch {killSwitch ? 'On' : 'Off'}</Text>
          </Pressable>
          <Pressable style={styles.quickChip} onPress={() => (free ? navigation.navigate('Plans') : setBlockAds(!blockAds))}>
            <FontAwesome6 name={free ? 'lock' : 'ban'} size={12} color={colors.orange} />
            <Text style={styles.quickLabel}>Ad Block {free ? '· Pro' : blockAds ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 },
  title: { fontFamily: font.extraBold, fontSize: 19, color: colors.textPrimary, letterSpacing: 0.5 },
  connectWrap: { alignItems: 'center', marginVertical: 8, marginBottom: 30 },
  connectBtn: {
    width: 196, height: 196, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 10,
  },
  connectLabel: { fontFamily: font.bold, fontSize: 14, color: '#fff', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  statusDot: { width: 8, height: 8, borderRadius: 9999 },
  statusText: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,147,0,0.1)', borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  promoText: { flex: 1, fontFamily: font.semiBold, fontSize: 12.5, color: colors.textPrimary },
  errorBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(255,147,0,0.1)', borderRadius: radii.md, padding: 12, marginBottom: 14 },
  errorText: { fontFamily: font.regular, fontSize: 13, color: colors.textPrimary },
  errorLink: { fontFamily: font.semiBold, fontSize: 13, color: colors.orange, marginTop: 6 },
  serverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, marginBottom: 14 },
  flag: { fontSize: 22 },
  serverCity: { fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary },
  serverHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statTile: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center' },
  statLabel: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: 12 },
  quickLabel: { fontFamily: font.semiBold, fontSize: 12, color: colors.textPrimary },
});
