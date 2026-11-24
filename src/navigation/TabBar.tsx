import { Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { FontAwesome6 } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, font } from '../theme';

// Height of the tab buttons themselves; the phone's own navigation bar (gesture strip or 3 buttons) is added below.
export const TAB_BAR_HEIGHT = 64;

const TAB_ICONS: Record<string, React.ComponentProps<typeof FontAwesome6>['name']> = {
  Home: 'house',
  Servers: 'server',
  Security: 'shield-halved',
  Devices: 'mobile-screen-button',
  Settings: 'gear',
};

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);
  return (
    <BlurView intensity={40} tint="dark" style={[styles.bar, { height: TAB_BAR_HEIGHT + bottom, paddingBottom: bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = (options.tabBarLabel as string) ?? route.name;
        const color = focused ? colors.orange : colors.tabInactive;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}
          >
            <FontAwesome6 name={TAB_ICONS[route.name]} size={19} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontFamily: font.semiBold, fontSize: 10.5 },
});
