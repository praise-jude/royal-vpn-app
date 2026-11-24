import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { api, type Plan } from '../lib/api';
import { startCheckout } from '../lib/payments';
import { useAuthStore } from '../store/useAuthStore';

type PlansResponse = { currency: string; days: number; paymentsEnabled: boolean; trialDays?: number; referralDays?: number; plans: Plan[] };

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

// Only what the server actually enforces: device count (shown above) and VIP-only locations.
const BASE_PERKS = ['All standard locations', 'WireGuard encryption'];
const PAID_PERKS = [...BASE_PERKS, 'Ad & tracker blocking'];
const PERKS: Record<string, string[]> = {
  free: BASE_PERKS,
  weekly: [...PAID_PERKS, 'Pay small, week by week'],
  pro: PAID_PERKS,
  family: [...PAID_PERKS, 'Share with your household'],
  vip: [...PAID_PERKS, 'VIP-only locations'],
};
const per = (days: number) => (days === 7 ? 'week' : days === 30 ? 'month' : `${days} days`);

export default function PlansScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [data, setData] = useState<PlansResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api<PlansResponse>('/plans', { auth: false }).then(setData).catch((e) => setLoadError(e.message));
  }, []);

  const [voucher, setVoucher] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  async function redeem() {
    if (redeeming || !voucher.trim()) return;
    setRedeeming(true);
    setMessage(null);
    try {
      const r = await api<{ user: any; days: number; planName: string }>('/vouchers/redeem', { method: 'POST', body: { code: voucher } });
      setUser(r.user);
      setVoucher('');
      setMessage({ kind: 'ok', text: `Voucher accepted: ${r.planName} for ${r.days} days. Enjoy!` });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.message || 'Could not use that voucher.' });
    } finally {
      setRedeeming(false);
    }
  }

  async function buy(plan: Plan) {
    if (busyPlan) return;
    setBusyPlan(plan.id);
    setMessage(null);
    try {
      const r = await startCheckout(plan.id);
      if (r === null) return; // web: navigating to Korapay
      if (r.paid) {
        setUser(r.user);
        setMessage({ kind: 'ok', text: `You're on ${r.user.planName}. Thank you!` });
      } else {
        setMessage({ kind: 'error', text: 'Payment not completed. If you were charged, it will show here within a few minutes.' });
      }
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.message || 'Could not start the payment.' });
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityLabel="Back">
        <FontAwesome6 name="chevron-left" size={15} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title}>Choose your plan</Text>
      <Text style={styles.subtitle}>
        {data ? 'Pay securely with card or bank transfer (Korapay), or use a voucher code.' : 'Loading plans…'}
      </Text>
      {user?.trial && user.planExpiresAt && (
        <View style={[styles.note, styles.noteOk]}><Text style={styles.noteText}>You're on a free Pro trial until {new Date(user.planExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Pick a plan to stay protected after that.</Text></View>
      )}

      <View style={styles.voucherCard}>
        <Text style={styles.voucherTitle}>Have a voucher code?</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={styles.voucherInput} value={voucher} onChangeText={(v) => setVoucher(v.toUpperCase())} placeholder="RV-XXXX-XXXX" placeholderTextColor={colors.textFaint} autoCapitalize="characters" autoCorrect={false} maxLength={16} onSubmitEditing={redeem} />
          <Pressable style={[styles.voucherBtn, redeeming && { opacity: 0.7 }]} onPress={redeem} disabled={redeeming}>
            {redeeming ? <ActivityIndicator color="#000" /> : <Text style={styles.buyText}>Use</Text>}
          </Pressable>
        </View>
        <Text style={styles.voucherHint}>Buy codes from a Royal-VPN agent or on WhatsApp, pay by transfer.</Text>
      </View>

      {message && (
        <View style={[styles.note, message.kind === 'ok' ? styles.noteOk : styles.noteErr]}>
          <Text style={styles.noteText}>{message.text}</Text>
        </View>
      )}
      {loadError && <View style={[styles.note, styles.noteErr]}><Text style={styles.noteText}>{loadError}</Text></View>}
      {data && !data.paymentsEnabled && (
        <View style={[styles.note, styles.noteErr]}><Text style={styles.noteText}>Upgrades open soon. Your free plan keeps working meanwhile.</Text></View>
      )}
      {!data && !loadError && <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />}

      {data?.plans.map((plan) => {
        const current = user?.planId === plan.id && !user?.trial;
        const buyable = plan.id !== 'free' && plan.amountNaira > 0 && data.paymentsEnabled;
        return (
          <View key={plan.id} style={[styles.card, current && styles.cardCurrent]}>
            <View style={styles.cardHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {plan.id !== 'free' && <FontAwesome6 name="crown" size={13} color={colors.orange} />}
                <Text style={styles.planName}>{plan.name}</Text>
                {current && <View style={styles.badge}><Text style={styles.badgeText}>CURRENT</Text></View>}
              </View>
              <Text style={styles.price}>
                {plan.amountNaira ? naira(plan.amountNaira) : 'Free'}
                {plan.amountNaira ? <Text style={styles.per}> / {per(plan.days || data.days)}</Text> : null}
              </Text>
            </View>
            <Text style={styles.devices}>
              <FontAwesome6 name="mobile-screen-button" size={11} color={colors.textMuted} />  {plan.devices} device{plan.devices === 1 ? '' : 's'}
            </Text>
            {(PERKS[plan.id] || []).map((p) => (
              <View key={p} style={styles.perk}>
                <FontAwesome6 name="check" size={11} color={colors.green} />
                <Text style={styles.perkText}>{p}</Text>
              </View>
            ))}
            {buyable && (
              <Pressable style={[styles.buy, busyPlan === plan.id && { opacity: 0.7 }]} onPress={() => buy(plan)} disabled={!!busyPlan}>
                {busyPlan === plan.id ? <ActivityIndicator color="#000" /> : <Text style={styles.buyText}>{current ? 'Renew' : `Get ${plan.name}`}</Text>}
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, backgroundColor: colors.bg },
  back: { width: 36, height: 36, borderRadius: 9999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  note: { borderRadius: radii.md, padding: 12, marginBottom: 14 },
  noteOk: { backgroundColor: 'rgba(34,197,94,0.14)' },
  noteErr: { backgroundColor: 'rgba(239,68,68,0.12)' },
  noteText: { fontFamily: font.regular, fontSize: 13, color: colors.textPrimary },
  card: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'transparent' },
  cardCurrent: { borderColor: colors.orange },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 },
  planName: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
  price: { fontFamily: font.bold, fontSize: 16, color: colors.orange },
  per: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  devices: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  perkText: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
  badge: { backgroundColor: 'rgba(255,147,0,0.18)', borderRadius: 9999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontFamily: font.bold, fontSize: 9, color: colors.orange, letterSpacing: 0.5 },
  buy: { backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  buyText: { fontFamily: font.bold, fontSize: 14, color: '#000' },
  voucherCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 14, marginBottom: 14, gap: 8 },
  voucherTitle: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  voucherInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, letterSpacing: 1 },
  voucherBtn: { backgroundColor: colors.orange, borderRadius: radii.md, paddingHorizontal: 18, justifyContent: 'center' },
  voucherHint: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
});
