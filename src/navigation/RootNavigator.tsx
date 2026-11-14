import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import ServersScreen from '../screens/ServersScreen';
import SecurityScreen from '../screens/SecurityScreen';
import DevicesScreen from '../screens/DevicesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PlansScreen from '../screens/PlansScreen';
import AuthScreen from '../screens/AuthScreen';
import TabBar from './TabBar';
import { colors, font, radii } from '../theme';
import { useAuthStore } from '../store/useAuthStore';
import { useVpnStore } from '../store/useVpnStore';
import { readReturnedPayment, verifyPayment } from '../lib/payments';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg } };

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg, paddingTop: 58, paddingBottom: 100 } }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Servers" component={ServersScreen} />
      <Tab.Screen name="Security" component={SecurityScreen} />
      <Tab.Screen name="Devices" component={DevicesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const setUser = useAuthStore((s) => s.setUser);
  const loadServers = useVpnStore((s) => s.loadServers);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { void restore(); }, [restore]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    void loadServers();
    // Back from Korapay on the web: confirm the payment with the server.
    const reference = readReturnedPayment();
    if (reference) {
      verifyPayment(reference)
        .then((r) => {
          if (r.paid) { setUser(r.user); setBanner({ ok: true, text: `Payment received. You're on ${r.user.planName}.` }); }
          else setBanner({ ok: false, text: 'Payment not completed. If you were charged, your plan updates within a few minutes.' });
        })
        .catch((e) => setBanner({ ok: false, text: e?.message || 'Could not confirm the payment.' }));
    }
    const id = setInterval(() => { void loadServers(); }, 60000);
    return () => clearInterval(id);
  }, [status, loadServers, setUser]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(id);
  }, [banner]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.orange} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          {status === 'signedIn' ? (
            <>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="Plans" component={PlansScreen} options={{ contentStyle: { backgroundColor: colors.bg, paddingTop: 58 } }} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {banner && (
        <View style={[styles.banner, { backgroundColor: banner.ok ? '#14532D' : '#7F1D1D' }]} pointerEvents="none">
          <Text style={styles.bannerText}>{banner.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 16, left: 16, right: 16, borderRadius: radii.md, padding: 12 },
  bannerText: { fontFamily: font.medium, fontSize: 13, color: '#fff', textAlign: 'center' },
});
