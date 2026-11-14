import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import { useVpnStore, useSelectedServer } from '../store/useVpnStore';
import { vpn } from '../lib/vpn';
import ToggleSwitch from '../components/ToggleSwitch';

export default function SecurityScreen() {
  const killSwitch = useVpnStore((s) => s.killSwitch);
  const autoConnect = useVpnStore((s) => s.autoConnect);
  const toggleKillSwitch = useVpnStore((s) => s.toggleKillSwitch);
  const toggleAutoConnect = useVpnStore((s) => s.toggleAutoConnect);
  const connected = useVpnStore((s) => s.status === 'connected');
  const server = useSelectedServer();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 20 }}>
      <Text style={styles.title}>Security Center</Text>
      <Text style={styles.subtitle}>Your protection status at a glance</Text>

      <View style={[styles.dnsCard, !connected && styles.offCard]}>
        <FontAwesome6 name={connected ? 'circle-check' : 'circle-exclamation'} size={20} color={connected ? colors.green : colors.yellow} />
        <View style={{ flex: 1 }}>
          <Text style={styles.dnsTitle}>{connected ? 'You are protected' : 'Not protected'}</Text>
          <Text style={styles.dnsSub}>
            {connected
              ? `Traffic encrypted with WireGuard via ${server?.city ?? 'Royal-VPN'}`
              : vpn.available ? 'Connect from the Home tab to encrypt your traffic' : vpn.unavailableReason}
          </Text>
        </View>
      </View>

      <SettingToggle
        icon="power-off"
        title="Kill Switch"
        sub="Block traffic if VPN drops"
        value={killSwitch}
        onToggle={toggleKillSwitch}
      />
      <SettingToggle
        icon="wifi"
        title="Auto-Connect"
        sub="On public & untrusted Wi-Fi"
        value={autoConnect}
        onToggle={toggleAutoConnect}
      />
      {!vpn.available && (
        <Text style={styles.trustedSub}>Kill Switch and Auto-Connect take effect in the Royal-VPN Android app.</Text>
      )}
    </ScrollView>
  );
}

function SettingToggle({
  icon,
  title,
  sub,
  value,
  onToggle,
}: {
  icon: React.ComponentProps<typeof FontAwesome6>['name'];
  title: string;
  sub: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <FontAwesome6 name={icon} size={16} color={colors.orange} style={{ width: 20 }} />
        <View>
          <Text style={styles.toggleTitle}>{title}</Text>
          <Text style={styles.toggleSub}>{sub}</Text>
        </View>
      </View>
      <ToggleSwitch value={value} onToggle={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  dnsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 18,
  },
  offCard: { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.3)' },
  dnsTitle: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary },
  dnsSub: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  toggleSub: { fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  trustedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: 16,
  },
  trustedSub: { fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
});
