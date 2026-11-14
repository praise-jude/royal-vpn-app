import { View, Text, FlatList, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import { SERVERS } from '../data/servers';
import { useVpnStore } from '../store/useVpnStore';
import ServerRow from '../components/ServerRow';

export default function ServersScreen() {
  const serverId = useVpnStore((s) => s.serverId);
  const favorites = useVpnStore((s) => s.favorites);
  const selectServer = useVpnStore((s) => s.selectServer);
  const toggleFavorite = useVpnStore((s) => s.toggleFavorite);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Servers</Text>
      <Text style={styles.subtitle}>Choose the best gateway for you</Text>

      <View style={styles.searchBar}>
        <FontAwesome6 name="magnifying-glass" size={13} color="rgba(255,255,255,0.4)" />
        <Text style={styles.searchPlaceholder}>Search country or city</Text>
      </View>

      <FlatList
        data={SERVERS}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ServerRow
            server={item}
            selected={item.id === serverId}
            favorite={!!favorites[item.id]}
            onSelect={() => selectServer(item.id)}
            onToggleFavorite={() => toggleFavorite(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  title: { fontFamily: font.extraBold, fontSize: 25, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  searchPlaceholder: { fontFamily: font.regular, fontSize: 14, color: 'rgba(255,255,255,0.4)' },
});
