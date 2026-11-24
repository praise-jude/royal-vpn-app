// Admin (ADMIN_EMAILS only): sales numbers, and voucher codes to sell yourself or through agents.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Share, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { api } from '../lib/api';

type Stats = { users: number; newThisWeek: number; paying: number; onTrial: number; revenue30dNaira: number; vouchersUsed30d: number; referralsPaid: number };
type Batch = { batch: string; planName: string; days: number; agent: string | null; createdAt: string; total: number; used: number };
type Made = { batch: string; planName: string; days: number; agent: string | null; codes: string[] };

const PLANS = [
  { id: 'weekly', label: 'Weekly', days: 7 },
  { id: 'pro', label: 'Pro', days: 30 },
  { id: 'family', label: 'Family', days: 30 },
  { id: 'vip', label: 'VIP', days: 30 },
];
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export default function AdminScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [planId, setPlanId] = useState('pro');
  const [days, setDays] = useState('30');
  const [count, setCount] = useState('10');
  const [agent, setAgent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);

  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setMsg(e.message));
    api<{ batches: Batch[] }>('/admin/vouchers').then((r) => setBatches(r.batches)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const shareCodes = (title: string, codes: string[]) =>
    Share.share({ message: `${title}\n\n${codes.join('\n')}\n\nTo use: open Royal-VPN → Settings → Use a voucher code. Download: https://vpn.royalmancloud.com` }).catch(() => {});

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Made>('/admin/vouchers', { method: 'POST', body: { planId, days: Number(days), count: Number(count), agent: agent.trim() || undefined } });
      setMade(r);
      load();
    } catch (e: any) {
      setMsg(e?.message || 'Could not create codes.');
    } finally {
      setBusy(false);
    }
  }

  async function openBatch(b: Batch) {
    try {
      const r = await api<{ codes: { code: string; usedAt: string | null }[] }>(`/admin/vouchers/${encodeURIComponent(b.batch)}`);
      const unused = r.codes.filter((c) => !c.usedAt).map((c) => c.code);
      if (!unused.length) return setMsg('All codes in that batch have been used.');
      shareCodes(`Royal-VPN ${b.planName} · ${b.days} days${b.agent ? ` · ${b.agent}` : ''} (${unused.length} unused)`, unused);
    } catch (e: any) { setMsg(e?.message || 'Could not load the batch.'); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityLabel="Back">
        <FontAwesome6 name="chevron-left" size={15} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title}>Sales</Text>

      {stats ? (
        <View style={styles.grid}>
          {[
            ['Revenue (30 days)', naira(stats.revenue30dNaira)], ['Paying now', String(stats.paying)], ['On free trial', String(stats.onTrial)],
            ['All users', String(stats.users)], ['New this week', String(stats.newThisWeek)], ['Vouchers used (30d)', String(stats.vouchersUsed30d)],
          ].map(([k, v]) => (
            <View key={k} style={styles.tile}><Text style={styles.tileNum}>{v}</Text><Text style={styles.tileLabel}>{k}</Text></View>
          ))}
        </View>
      ) : <ActivityIndicator color={colors.orange} style={{ marginVertical: 20 }} />}

      <Text style={styles.h2}>Make voucher codes</Text>
      <View style={styles.card}>
        <View style={styles.chips}>
          {PLANS.map((p) => (
            <Pressable key={p.id} style={[styles.chip, planId === p.id && styles.chipOn]} onPress={() => { setPlanId(p.id); setDays(String(p.days)); }}>
              <Text style={[styles.chipText, planId === p.id && { color: '#000' }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Days</Text><TextInput style={styles.input} value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={3} /></View>
          <View style={{ flex: 1 }}><Text style={styles.label}>How many</Text><TextInput style={styles.input} value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={3} /></View>
        </View>
        <Text style={styles.label}>Agent name (optional, to track their sales)</Text>
        <TextInput style={styles.input} value={agent} onChangeText={setAgent} placeholder="e.g. Tunde Ikeja" placeholderTextColor={colors.textFaint} maxLength={60} />
        {msg && <Text style={styles.msg}>{msg}</Text>}
        <Pressable style={[styles.btn, busy && { opacity: 0.7 }]} onPress={create} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Create codes</Text>}
        </Pressable>
      </View>

      {made && (
        <View style={[styles.card, { borderColor: colors.orange, borderWidth: 1 }]}>
          <Text style={styles.h3}>{made.codes.length} × {made.planName} · {made.days} days{made.agent ? ` · ${made.agent}` : ''}</Text>
          {made.codes.slice(0, 8).map((c) => <Text key={c} style={styles.code} selectable>{c}</Text>)}
          {made.codes.length > 8 && <Text style={styles.small}>…and {made.codes.length - 8} more</Text>}
          <Pressable style={styles.btn} onPress={() => shareCodes(`Royal-VPN ${made.planName} · ${made.days} days${made.agent ? ` · ${made.agent}` : ''}`, made.codes)}>
            <Text style={styles.btnText}>Share / copy all codes</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.h2}>Batches</Text>
      {batches.length === 0 && <Text style={styles.small}>No codes yet.</Text>}
      {batches.map((b) => (
        <Pressable key={b.batch} style={styles.row} onPress={() => openBatch(b)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{b.planName} · {b.days} days{b.agent ? ` · ${b.agent}` : ''}</Text>
            <Text style={styles.small}>{new Date(b.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {b.used} of {b.total} used</Text>
          </View>
          <FontAwesome6 name="share-nodes" size={14} color={colors.orange} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, backgroundColor: colors.bg },
  back: { width: 36, height: 36, borderRadius: 9999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 12 },
  h2: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary, marginTop: 18, marginBottom: 10 },
  h3: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', flexGrow: 1, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: 12 },
  tileNum: { fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  tileLabel: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  card: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 14, gap: 8, marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.orange },
  chipText: { fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary },
  label: { fontFamily: font.medium, fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.regular, fontSize: 14, color: colors.textPrimary },
  msg: { fontFamily: font.regular, fontSize: 12, color: '#FCA5A5' },
  btn: { backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnText: { fontFamily: font.bold, fontSize: 14, color: '#000' },
  code: { fontFamily: font.semiBold, fontSize: 15, color: colors.orange, letterSpacing: 1 },
  small: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: 14, marginBottom: 8 },
  rowTitle: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
});
