import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { useVpnStore, useSelectedServer } from '../store/useVpnStore';
import { vpn } from '../lib/vpn';
import { api } from '../lib/api';
import ToggleSwitch from '../components/ToggleSwitch';

type IpCheck = { ip: string; country: string | null; protected: boolean; server: { city: string; country: string } | null };

export default function SecurityScreen() {
  const navigation = useNavigation<any>();
  const s = useVpnStore();
  const server = useSelectedServer();
  const connected = s.status === 'connected';
  const [check, setCheck] = useState<IpCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function runLeakTest() {
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(await api<IpCheck>('/ip', { auth: false }));
    } catch (e: any) {
      setCheckError(e?.message || 'Could not run the test.');
    } finally {
      setChecking(false);
    }
  }

  const native = vpn.available;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 20 }}>
      <Text style={styles.title}>Security Center</Text>
      <Text style={styles.subtitle}>Your protection status at a glance</Text>

      <View style={[styles.statusCard, !connected && (s.guardActive ? styles.guardCard : styles.offCard)]}>
        <FontAwesome6
          name={connected ? 'circle-check' : s.guardActive ? 'lock' : 'circle-exclamation'}
          size={20}
          color={connected ? colors.green : s.guardActive ? colors.orange : colors.yellow}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{connected ? 'You are protected' : s.guardActive ? 'Traffic blocked' : 'Not protected'}</Text>
          <Text style={styles.cardSub}>
            {connected
              ? `Traffic encrypted with WireGuard via ${server?.city ?? 'Royal-VPN'}`
              : s.guardActive
                ? 'Nothing leaves this device until you reconnect or turn off Lockdown'
                : native ? 'Connect from the Home tab to encrypt your traffic' : vpn.unavailableReason}
          </Text>
        </View>
      </View>

      {s.reconnectHint && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Reconnect to apply your new settings.</Text>
          <Pressable onPress={() => s.connect()} hitSlop={8}><Text style={styles.hintLink}>Reconnect</Text></Pressable>
        </View>
      )}

      <Text style={styles.section}>PROTECTION</Text>
      <SettingToggle icon="power-off" title="Kill Switch" sub="Block all traffic if the VPN drops unexpectedly" value={s.killSwitch} onToggle={() => s.setKillSwitch(!s.killSwitch)} disabled={!native} />
      <SettingToggle icon="lock" title="Royal Lockdown" sub="Block all traffic whenever the VPN is off" value={s.lockdown} onToggle={() => s.setLockdown(!s.lockdown)} disabled={!native} />
      <SettingToggle icon="ban" title="Block ads & trackers" sub="Filter ad, tracker and malware domains (AdGuard DNS)" value={s.blockAds} onToggle={() => s.setBlockAds(!s.blockAds)} disabled={!native} />
      <SettingToggle icon="bolt" title="Connect on launch" sub="Connect automatically when Royal-VPN opens" value={s.autoConnect} onToggle={() => s.setAutoConnect(!s.autoConnect)} disabled={!native} />

      <Text style={styles.section}>ADVANCED</Text>
      <NavRow
        icon="code-branch"
        title="Split tunnelling"
        sub={s.excludedApps.length ? `${s.excludedApps.length} app${s.excludedApps.length === 1 ? '' : 's'} bypass the VPN` : 'All apps use the VPN'}
        onPress={() => navigation.navigate('SplitTunnel')}
        disabled={!native}
      />
      <NavRow
        icon="shield-halved"
        title="Always-on VPN"
        sub="Open Android settings to keep Royal-VPN on, even after restarts"
        onPress={() => vpn.openSystemVpnSettings()}
        disabled={!native}
      />

      <Text style={styles.section}>LEAK TEST</Text>
      <View style={styles.leakCard}>
        {check ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FontAwesome6 name={check.protected ? 'circle-check' : 'triangle-exclamation'} size={15} color={check.protected ? colors.green : colors.yellow} />
              <Text style={styles.cardTitle}>{check.protected ? `Hidden behind ${check.server?.city}` : 'Your real address is visible'}</Text>
            </View>
            <Text style={styles.cardSub}>
              Websites see {check.ip}{check.country ? ` (${check.country})` : ''}.{' '}
              {check.protected ? 'That’s a Royal-VPN server, not you.' : 'Connect to hide it.'}
            </Text>
          </>
        ) : (
          <Text style={styles.cardSub}>See the address websites see for you, and whether it’s a Royal-VPN server.</Text>
        )}
        {checkError && <Text style={[styles.cardSub, { color: '#FCA5A5' }]}>{checkError}</Text>}
        <Pressable style={styles.testBtn} onPress={runLeakTest} disabled={checking}>
          {checking ? <ActivityIndicator color="#000" /> : <Text style={styles.testText}>{check ? 'Test again' : 'Run leak test'}</Text>}
        </Pressable>
      </View>

      {!native && <Text style={styles.footnote}>Protection settings work in the Royal-VPN Android app.</Text>}
    </ScrollView>
  );
}

function SettingToggle({ icon, title, sub, value, onToggle, disabled }: {
  icon: React.ComponentProps<typeof FontAwesome6>['name']; title: string; sub: string; value: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={styles.rowLeft}>
        <FontAwesome6 name={icon} size={16} color={colors.orange} style={{ width: 20 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSub}>{sub}</Text>
        </View>
      </View>
      <ToggleSwitch value={value} onToggle={disabled ? () => {} : onToggle} />
    </View>
  );
}

function NavRow({ icon, title, sub, onPress, disabled }: {
  icon: React.ComponentProps<typeof FontAwesome6>['name']; title: string; sub: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.row, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <View style={styles.rowLeft}>
        <FontAwesome6 name={icon} size={16} color={colors.orange} style={{ width: 20 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSub}>{sub}</Text>
        </View>
      </View>
      <FontAwesome6 name="chevron-right" size={13} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', borderRadius: radii.lg, padding: 14, marginBottom: 12 },
  offCard: { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.3)' },
  guardCard: { backgroundColor: 'rgba(255,147,0,0.1)', borderColor: 'rgba(255,147,0,0.35)' },
  cardTitle: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary },
  cardSub: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,15,154,0.3)', borderRadius: radii.md, padding: 12, marginBottom: 12 },
  hintText: { fontFamily: font.regular, fontSize: 12, color: colors.textPrimary, flex: 1 },
  hintLink: { fontFamily: font.semiBold, fontSize: 12, color: colors.orange },
  section: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.8, marginTop: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  rowSub: { fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  leakCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: 16, gap: 6 },
  testBtn: { backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  testText: { fontFamily: font.bold, fontSize: 13, color: '#000' },
  footnote: { fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 14, textAlign: 'center' },
});
