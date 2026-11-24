// Virtual phone numbers from Royalman Cloud (the same company), opened from the VPN app. Ordering, texts and
// call forwarding live on royalmancloud.com; this screen explains the service and takes people there.
import { View, Text, Pressable, ScrollView, Linking, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';

const ORDER_URL = 'https://royalmancloud.com/numbers';
const MY_NUMBERS_URL = 'https://royalmancloud.com/account/numbers';
const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));

const POINTS: [React.ComponentProps<typeof FontAwesome6>['name'], string, string][] = [
  ['flag-usa', 'Real US & Canada numbers', 'A genuine +1 number for your business, kept as long as you renew.'],
  ['comment-sms', 'Receive texts anywhere', 'Every SMS shows in your Royalman account and arrives in your email.'],
  ['phone-volume', 'Calls to your Nigerian phone', 'Switch on call forwarding and calls ring your own line, paid per minute.'],
  ['naira-sign', 'Pay in naira', 'Monthly, by card or bank transfer — no dollar card needed.'],
];

export default function NumbersScreen() {
  const navigation = useNavigation<any>();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityLabel="Back">
        <FontAwesome6 name="chevron-left" size={15} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title}>US & Canada numbers</Text>
      <Text style={styles.subtitle}>From Royalman Cloud, the company behind Royal-VPN. From ₦5,000 a month.</Text>
      {POINTS.map(([icon, head, body]) => (
        <View key={head} style={styles.row}>
          <View style={styles.icon}><FontAwesome6 name={icon} size={16} color={colors.orange} /></View>
          <View style={{ flex: 1 }}><Text style={styles.rowHead}>{head}</Text><Text style={styles.rowBody}>{body}</Text></View>
        </View>
      ))}
      <Pressable style={styles.primary} onPress={() => open(ORDER_URL)}>
        <Text style={styles.primaryText}>Get a number</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => open(MY_NUMBERS_URL)}>
        <Text style={styles.secondaryText}>My numbers & texts</Text>
      </Pressable>
      <Text style={styles.note}>Uses a Royalman Cloud account (separate from your VPN login). Sign up once on the website.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, backgroundColor: colors.bg },
  back: { width: 36, height: 36, borderRadius: 9999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: 14, marginBottom: 10 },
  icon: { width: 36, height: 36, borderRadius: 9999, backgroundColor: 'rgba(255,147,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  rowHead: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  rowBody: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  primary: { backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { fontFamily: font.bold, fontSize: 15, color: '#000' },
  secondary: { backgroundColor: colors.surface, borderRadius: 9999, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryText: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  note: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 14 },
});
