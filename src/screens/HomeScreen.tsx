import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { useVpnStore, useSelectedServer, fmtDuration } from '../store/useVpnStore';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const connected = useVpnStore((s) => s.connected);
  const connecting = useVpnStore((s) => s.connecting);
  const seconds = useVpnStore((s) => s.seconds);
  const killSwitch = useVpnStore((s) => s.killSwitch);
  const autoConnect = useVpnStore((s) => s.autoConnect);
  const toggleConnect = useVpnStore((s) => s.toggleConnect);
  const toggleKillSwitch = useVpnStore((s) => s.toggleKillSwitch);
  const toggleAutoConnect = useVpnStore((s) => s.toggleAutoConnect);
  const tick = useVpnStore((s) => s.tick);
  const server = useSelectedServer();

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  const btnBg = connecting ? '#4B5563' : connected ? colors.blue : colors.orange;
  const label = connecting ? 'Connecting…' : connected ? 'PROTECTED' : 'CONNECT';
  const statusLine = connecting
    ? 'Securing your connection…'
    : connected
    ? 'Your connection is protected'
    : 'You are not protected';
  const statusDot = connected ? colors.green : connecting ? colors.yellow : colors.red;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <FontAwesome6 name="shield-halved" size={20} color={colors.orange} />
        <Text style={styles.title}>ROYAL-VPN</Text>
      </View>

      <View style={styles.connectWrap}>
        <Pressable
          onPress={toggleConnect}
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

      <Pressable style={styles.serverRow} onPress={() => navigation.navigate('Servers')}>
        <FontAwesome6 name="globe" size={19} color={colors.orange} style={{ width: 22 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.serverCity}>
            {server.city}, {server.country}
          </Text>
          <Text style={styles.serverHint}>Tap to change server</Text>
        </View>
        <FontAwesome6 name="chevron-right" size={13} color={colors.textFaint} />
      </Pressable>

      {connected && (
        <View style={styles.statsGrid}>
          <StatTile label="DURATION" value={fmtDuration(seconds)} />
          <StatTile label="PING" value={`${server.ping} ms`} />
          <StatTile label="PROTOCOL" value="WireGuard" />
        </View>
      )}

      <View style={styles.quickRow}>
        <Pressable style={styles.quickChip} onPress={toggleKillSwitch}>
          <FontAwesome6 name="power-off" size={12} color={colors.orange} />
          <Text style={styles.quickLabel}>
            Kill Switch {killSwitch ? 'On' : 'Off'}
          </Text>
        </Pressable>
        <Pressable style={styles.quickChip} onPress={toggleAutoConnect}>
          <FontAwesome6 name="wifi" size={12} color={colors.orange} />
          <Text style={styles.quickLabel}>
            Auto-Connect {autoConnect ? 'On' : 'Off'}
          </Text>
        </Pressable>
      </View>
    </View>
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
    width: 196,
    height: 196,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  connectLabel: { fontFamily: font.bold, fontSize: 14, color: '#fff', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  statusDot: { width: 8, height: 8, borderRadius: 9999 },
  statusText: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  serverCity: { fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary },
  serverHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statLabel: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  quickLabel: { fontFamily: font.semiBold, fontSize: 12, color: colors.textPrimary },
});
