import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import type { Server } from '../data/servers';

function loadColor(load: number) {
  if (load > 55) return colors.red;
  if (load > 35) return colors.yellow;
  return colors.green;
}

export default function ServerRow({
  server,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  server: Server;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={[
        styles.row,
        {
          backgroundColor: selected ? 'rgba(0,15,154,0.25)' : colors.surfaceStrong,
          borderColor: selected ? colors.blue : 'transparent',
        },
      ]}
    >
      <View style={[styles.loadDot, { backgroundColor: loadColor(server.load) }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.cityRow}>
          <Text style={styles.city}>{server.city}</Text>
          {server.recommended && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BEST</Text>
            </View>
          )}
        </View>
        <Text style={styles.sub}>
          {server.country} · Load {server.load}%
        </Text>
      </View>
      <Text style={styles.ping}>{server.ping} ms</Text>
      <Pressable hitSlop={8} onPress={onToggleFavorite}>
        <FontAwesome6
          name="star"
          solid={favorite}
          size={15}
          color={favorite ? colors.orange : 'rgba(255,255,255,0.35)'}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    marginBottom: 8,
    borderWidth: 1,
  },
  loadDot: { width: 9, height: 9, borderRadius: 9999 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  city: { fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary },
  sub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  ping: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary, marginRight: 4 },
  badge: {
    backgroundColor: colors.orange,
    borderRadius: 9999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: font.bold, fontSize: 9, color: '#000', letterSpacing: 0.5 },
});
