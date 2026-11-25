// The app is installed from royalmancloud.com (not an app store), so it checks once per launch whether a newer
// build has been published and offers a one-tap download. Keep BUILD equal to android.versionCode in app.json.
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, StyleSheet, Linking } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';

export const BUILD = 12;
const LATEST_URL = 'https://royalmancloud.com/api/apps/royal-vpn/latest';

type Latest = { version: string; versionCode: number; url: string; notes?: string };

export default function UpdateBanner() {
  const [latest, setLatest] = useState<Latest | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    fetch(LATEST_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Latest | null) => { if (j && Number(j.versionCode) > BUILD && /^https:\/\//.test(j.url)) setLatest(j); })
      .catch(() => {});
  }, []);
  if (!latest) return null;
  return (
    <Pressable style={styles.box} onPress={() => Linking.openURL(latest.url)} accessibilityRole="button">
      <FontAwesome6 name="circle-down" size={15} color={colors.green} />
      <Text style={styles.text}>Update available: version {latest.version}. Tap to download, then open the file to install.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  text: { flex: 1, fontFamily: font.semiBold, fontSize: 12.5, color: colors.textPrimary },
});
