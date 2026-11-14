import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import type { Server } from '../lib/api';

function dotColor(s: Server) {
  if (s.status !== 'AVAILABLE') return 'rgba(255,255,255,0.25)';
  const load = s.loadPct ?? 0;
  if (load > 75) return colors.red;
  if (load > 50) return colors.yellow;
  return colors.green;
}

function detail(s: Server) {
  if (s.status === 'COMING SOON') return `${s.country} · Coming soon`;
  if (s.status === 'OFFLINE') return `${s.country} · Temporarily offline`;
  const parts = [s.country];
  if (s.loadPct != null) parts.push(`Load ${Math.round(s.loadPct)}%`);
  return parts.join(' · ');
}

export default function ServerRow({
  server, selected, favorite, best, onSelect, onToggleFavorite,
}: {
  server: Server;
  selected: boolean;
  favorite: boolean;
  best: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const disabled = !server.live;
  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled}
      accessibilityState={{ selected, disabled }}
      style={[
        styles.row,
        {
          backgroundColor: selected ? 'rgba(0,15,154,0.25)' : colors.surfaceStrong,
          borderColor: selected ? colors.blue : 'transparent',
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text style={styles.flag}>{server.flag}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.cityRow}>
          <View style={[styles.loadDot, { backgroundColor: dotColor(server) }]} />
          <Text style={styles.city}>{server.city}</Text>
          {best && <View style={styles.badge}><Text style={styles.badgeText}>BEST</Text></View>}
          {server.vip && <View style={[styles.badge, styles.vip]}><Text style={[styles.badgeText, { color: colors.orange }]}>VIP</Text></View>}
        </View>
        <Text style={styles.sub}>{detail(server)}</Text>
      </View>
      {server.pingMs != null && <Text style={styles.ping}>{server.pingMs} ms</Text>}
      {server.live && (
        <Pressable hitSlop={8} onPress={onToggleFavorite} accessibilityLabel={favorite ? 'Remove from favourites' : 'Add to favourites'}>
          <FontAwesome6 name="star" solid={favorite} size={15} color={favorite ? colors.orange : 'rgba(255,255,255,0.35)'} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: radii.lg, marginBottom: 8, borderWidth: 1 },
  flag: { fontSize: 22 },
  loadDot: { width: 8, height: 8, borderRadius: 9999 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  city: { fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary },
  sub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  ping: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary, marginRight: 4 },
  badge: { backgroundColor: colors.orange, borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 2 },
  vip: { backgroundColor: 'rgba(255,147,0,0.15)' },
  badgeText: { fontFamily: font.bold, fontSize: 9, color: '#000', letterSpacing: 0.5 },
});
