import { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, RefreshControl, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, font, radii } from '../theme';
import { useVpnStore } from '../store/useVpnStore';
import ServerRow from '../components/ServerRow';

export default function ServersScreen() {
  const navigation = useNavigation<any>();
  const servers = useVpnStore((s) => s.servers);
  const loading = useVpnStore((s) => s.serversLoading);
  const error = useVpnStore((s) => s.serversError);
  const serverId = useVpnStore((s) => s.serverId);
  const favorites = useVpnStore((s) => s.favorites);
  const loadServers = useVpnStore((s) => s.loadServers);
  const selectServer = useVpnStore((s) => s.selectServer);
  const toggleFavorite = useVpnStore((s) => s.toggleFavorite);
  const [query, setQuery] = useState('');

  const bestId = useMemo(() => {
    // Least-loaded live server; only worth a badge when there's a choice.
    const up = servers.filter((s) => s.status === 'AVAILABLE' && s.loadPct != null);
    if (up.length < 2) return undefined;
    return up.sort((a, b) => (a.loadPct as number) - (b.loadPct as number))[0]?.id;
  }, [servers]);

  // Favourites first, then live servers, then coming soon; filtered by the search box.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (s: (typeof servers)[number]) => (favorites[s.id] && s.live ? 0 : s.live ? 1 : 2);
    return servers
      .filter((s) => !q || s.city.toLowerCase().includes(q) || s.country.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b));
  }, [servers, favorites, query]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Servers</Text>
      <Text style={styles.subtitle}>Choose the best gateway for you</Text>

      <View style={styles.searchBar}>
        <FontAwesome6 name="magnifying-glass" size={13} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search country or city"
          placeholderTextColor="rgba(255,255,255,0.4)"
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <FontAwesome6 name="xmark" size={13} color="rgba(255,255,255,0.5)" />
          </Pressable>
        )}
      </View>

      {error && (
        <Pressable style={styles.errorBox} onPress={loadServers}>
          <Text style={styles.errorText}>{error} Tap to retry.</Text>
        </Pressable>
      )}
      {loading && !servers.length && <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />}

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && servers.length > 0} onRefresh={loadServers} tintColor={colors.orange} />}
        ListEmptyComponent={!loading && servers.length > 0 ? <Text style={styles.empty}>No locations match “{query}”.</Text> : null}
        renderItem={({ item }) => (
          <ServerRow
            server={item}
            selected={item.id === serverId}
            favorite={!!favorites[item.id]}
            best={item.id === bestId}
            onSelect={() => { selectServer(item.id); navigation.navigate('Home'); }}
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
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 14, marginBottom: 18 },
  search: { flex: 1, paddingVertical: 10, fontFamily: font.regular, fontSize: 14, color: colors.textPrimary },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radii.md, padding: 12, marginBottom: 14 },
  errorText: { fontFamily: font.regular, fontSize: 13, color: '#FCA5A5' },
  empty: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 30 },
});
