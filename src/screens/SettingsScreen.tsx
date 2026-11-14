import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import SettingsRow from '../components/SettingsRow';

const PLAN_LABEL = 'PRO PLAN';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 20 }}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>A</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>Ada Okafor</Text>
          <Text style={styles.email}>ada.okafor@email.com</Text>
        </View>
        <FontAwesome6 name="chevron-right" size={13} color={colors.textFaint} />
      </View>

      <LinearGradient
        colors={[colors.blue, colors.orange]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.planCard}
      >
        <View style={styles.planHeader}>
          <FontAwesome6 name="crown" size={14} color="#fff" />
          <Text style={styles.planLabel}>{PLAN_LABEL}</Text>
        </View>
        <Text style={styles.planDetail}>Renews Sep 18, 2026 · All locations · 5 devices</Text>
        <Pressable style={styles.manageBtn}>
          <Text style={styles.manageBtnText}>Manage Subscription</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.list}>
        <SettingsRow icon="bell" label="Notifications" />
        <SettingsRow icon="globe" label="Language" detail="English" />
        <SettingsRow icon="headset" label="Royal Support" />
        <SettingsRow icon="lock" label="Privacy Center" last />
      </View>

      <Pressable style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      <Text style={styles.version}>Royal-VPN v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 18 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 9999,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.bold, fontSize: 18, color: '#000' },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  email: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  planCard: { borderRadius: radii.xl, padding: 18, marginBottom: 14 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  planLabel: { fontFamily: font.bold, fontSize: 13, color: '#fff', letterSpacing: 0.5 },
  planDetail: { fontFamily: font.regular, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 14 },
  manageBtn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 9999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  manageBtnText: { fontFamily: font.semiBold, fontSize: 13, color: '#000' },
  list: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: 16,
  },
  logoutBtn: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  version: { textAlign: 'center', fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 16 },
});
