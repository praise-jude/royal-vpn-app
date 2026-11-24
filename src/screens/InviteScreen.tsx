// Invite friends: your code and link; when a friend you invited makes their first payment, you both get free days.
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Share, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { api } from '../lib/api';

type Referral = { code: string; link: string; days: number; joined: number; paid: number };

export default function InviteScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<Referral | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api<Referral>('/referral').then(setData).catch((e) => setError(e.message)); }, []);

  async function share() {
    if (!data) return;
    await Share.share({
      message: `I use Royal-VPN to stay safe and private online — fast WireGuard VPN, pay in naira. Sign up with my invite code ${data.code} and we both get ${data.days} free days when you upgrade: ${data.link}`,
    }).catch(() => {});
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityLabel="Back">
        <FontAwesome6 name="chevron-left" size={15} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title}>Invite friends</Text>
      <Text style={styles.subtitle}>
        {data ? `Share your code. When a friend you invite pays for any plan, you both get ${data.days} extra days free.` : 'Loading…'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {!data && !error && <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />}
      {data && (
        <>
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>YOUR INVITE CODE</Text>
            <Text style={styles.code} selectable>{data.code}</Text>
          </View>
          <Pressable style={styles.shareBtn} onPress={share}>
            <FontAwesome6 name="share-nodes" size={15} color="#000" />
            <Text style={styles.shareText}>Share on WhatsApp & more</Text>
          </Pressable>
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statNum}>{data.joined}</Text><Text style={styles.statLabel}>joined</Text></View>
            <View style={styles.stat}><Text style={styles.statNum}>{data.paid}</Text><Text style={styles.statLabel}>upgraded</Text></View>
            <View style={styles.stat}><Text style={styles.statNum}>{data.paid * data.days}</Text><Text style={styles.statLabel}>free days earned</Text></View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, backgroundColor: colors.bg },
  back: { width: 36, height: 36, borderRadius: 9999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18, lineHeight: 19 },
  error: { fontFamily: font.regular, fontSize: 13, color: '#FCA5A5' },
  codeCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.xl, padding: 20, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,147,0,0.35)' },
  codeLabel: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 1 },
  code: { fontFamily: font.extraBold, fontSize: 32, color: colors.orange, letterSpacing: 4, marginTop: 6 },
  shareBtn: { flexDirection: 'row', gap: 10, backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  shareText: { fontFamily: font.bold, fontSize: 14, color: '#000' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  statNum: { fontFamily: font.bold, fontSize: 20, color: colors.textPrimary },
  statLabel: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
