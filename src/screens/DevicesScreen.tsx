import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import { useVisibleDevices, useVpnStore } from '../store/useVpnStore';
import type { Device } from '../data/servers';

export default function DevicesScreen() {
  const devices = useVisibleDevices();
  const signOutDevice = useVpnStore((s) => s.signOutDevice);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Devices</Text>
      <Text style={styles.subtitle}>Manage where you're signed in</Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <DeviceRow device={item} onSignOut={() => signOutDevice(item.id)} />
        )}
      />
    </View>
  );
}

function DeviceRow({ device, onSignOut }: { device: Device; onSignOut: () => void }) {
  return (
    <View style={styles.row}>
      <FontAwesome6 name="mobile-screen-button" size={17} color={colors.blue} style={{ width: 22 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{device.name}</Text>
        <Text style={styles.sub}>
          {device.platform} · {device.lastActive}
        </Text>
      </View>
      {device.current ? (
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>THIS DEVICE</Text>
        </View>
      ) : (
        <Pressable onPress={onSignOut} hitSlop={8}>
          <Text style={styles.signOut}>Sign Out</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
  },
  name: { fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary },
  sub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  currentBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentBadgeText: { fontFamily: font.bold, fontSize: 9, color: colors.green, letterSpacing: 0.5 },
  signOut: { fontFamily: font.semiBold, fontSize: 12, color: colors.red, paddingVertical: 6, paddingHorizontal: 8 },
});
