import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import SettingsRow from '../components/SettingsRow';
import { api } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';
import { useVpnStore } from '../store/useVpnStore';

const SUPPORT_EMAIL = 'info@royalmancloud.com';
const PRIVACY_URL = 'https://royalmancloud.com/legal/royal-vpn-privacy';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const resetVpn = useVpnStore((s) => s.reset);
  const [changing, setChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;
  const paid = user.planId !== 'free';
  const planDetail = [
    user.lifetime ? 'Lifetime — no subscription needed' : user.trial && user.planExpiresAt ? `Free trial until ${fmtDate(user.planExpiresAt)}` : paid && user.planExpiresAt ? `Active until ${fmtDate(user.planExpiresAt)}` : paid ? 'No expiry' : 'Upgrade for more devices & ad blocking',
    `${user.deviceLimit} device${user.deviceLimit === 1 ? '' : 's'}`,
  ].join(' · ');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>

      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.email[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{user.email}</Text>
          <Text style={styles.email}>{user.lifetime ? `${user.planName} · Lifetime` : user.trial ? `${user.planName} trial` : `${user.planName} plan`}</Text>
        </View>
      </View>

      <LinearGradient colors={[colors.blue, colors.orange]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planCard}>
        <View style={styles.planHeader}>
          <FontAwesome6 name="crown" size={14} color="#fff" />
          <Text style={styles.planLabel}>{user.planName.toUpperCase()} {user.lifetime ? 'LIFETIME' : user.trial ? 'TRIAL' : 'PLAN'}</Text>
        </View>
        <Text style={styles.planDetail}>{planDetail}</Text>
        {!user.lifetime && (
          <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('Plans')}>
            <Text style={styles.manageBtnText}>{user.trial || !paid ? 'Upgrade' : 'Renew or change plan'}</Text>
          </Pressable>
        )}
      </LinearGradient>

      <View style={styles.list}>
        <SettingsRow icon="gift" label="Invite friends" detail="Free days for you both" onPress={() => navigation.navigate('Invite')} />
        <SettingsRow icon="phone" label="US & Canada number" detail="Texts + calls · from ₦5,000" onPress={() => navigation.navigate('Numbers')} />
        {!user.lifetime && <SettingsRow icon="ticket" label="Use a voucher code" onPress={() => navigation.navigate('Plans')} />}
        {user.isAdmin && <SettingsRow icon="chart-line" label="Sales & agent vouchers" detail="Admin" onPress={() => navigation.navigate('Admin')} />}
        <SettingsRow icon="key" label="Change password" onPress={() => setChanging((v) => !v)} />
        <SettingsRow icon="headset" label="Royal Support" detail={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Royal-VPN%20support`)} />
        <SettingsRow icon="shield-halved" label="Privacy policy" detail="No activity logs" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <SettingsRow icon="trash-can" label="Delete account" onPress={() => setDeleting((v) => !v)} last />
      </View>

      {changing && <ChangePassword onDone={() => setChanging(false)} />}
      {deleting && <DeleteAccount onDeleted={() => { resetVpn(); void signOut(); }} />}

      <Pressable style={styles.logoutBtn} onPress={() => { resetVpn(); void signOut(); }}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      <Text style={styles.version}>Royal-VPN v1.2.0</Text>
    </ScrollView>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function remove() {
    if (!password) return setMsg('Enter your password to confirm.');
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/delete-account', { method: 'POST', body: { password } });
      onDeleted();
    } catch (e: any) {
      setMsg(e?.message || 'Could not delete your account.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.pwCard}>
      <Text style={styles.pwMsg}>This permanently deletes your Royal-VPN account, your devices and your payment history, and disconnects all your devices. Any time left on a paid plan is lost. This can't be undone.</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.textFaint} secureTextEntry autoComplete="current-password" onSubmitEditing={remove} />
      {msg && <Text style={[styles.pwMsg, { color: '#FCA5A5' }]}>{msg}</Text>}
      <Pressable style={[styles.saveBtn, { backgroundColor: '#DC2626' }, busy && { opacity: 0.7 }]} onPress={remove} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.saveText, { color: '#fff' }]}>Delete my account</Text>}
      </Pressable>
    </View>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (next.length < 8) return setMsg({ ok: false, text: 'Use a new password of at least 8 characters.' });
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setMsg({ ok: true, text: 'Password changed.' });
      setCurrent('');
      setNext('');
      setTimeout(onDone, 1200);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not change your password.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.pwCard}>
      <TextInput style={styles.input} value={current} onChangeText={setCurrent} placeholder="Current password" placeholderTextColor={colors.textFaint} secureTextEntry autoComplete="current-password" />
      <TextInput style={styles.input} value={next} onChangeText={setNext} placeholder="New password (8+ characters)" placeholderTextColor={colors.textFaint} secureTextEntry autoComplete="new-password" onSubmitEditing={save} />
      {msg && <Text style={[styles.pwMsg, { color: msg.ok ? colors.green : '#FCA5A5' }]}>{msg.text}</Text>}
      <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
        {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Save password</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 18 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 16, marginBottom: 14 },
  avatar: { width: 50, height: 50, borderRadius: 9999, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.bold, fontSize: 18, color: '#000' },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  email: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  planCard: { borderRadius: radii.xl, padding: 18, marginBottom: 14 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  planLabel: { fontFamily: font.bold, fontSize: 13, color: '#fff', letterSpacing: 0.5 },
  planDetail: { fontFamily: font.regular, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 14 },
  manageBtn: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 9999, paddingVertical: 10, alignItems: 'center' },
  manageBtnText: { fontFamily: font.semiBold, fontSize: 13, color: '#000' },
  list: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, overflow: 'hidden', marginBottom: 16 },
  pwCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 14, marginBottom: 16, gap: 10 },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.regular, fontSize: 14, color: colors.textPrimary },
  pwMsg: { fontFamily: font.regular, fontSize: 12 },
  saveBtn: { backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 12, alignItems: 'center' },
  saveText: { fontFamily: font.bold, fontSize: 14, color: '#000' },
  logoutBtn: { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  logoutText: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  version: { textAlign: 'center', fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 16 },
});
