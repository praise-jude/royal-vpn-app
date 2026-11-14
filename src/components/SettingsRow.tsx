import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font } from '../theme';

export default function SettingsRow({
  icon,
  label,
  detail,
  last,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome6>['name'];
  label: string;
  detail?: string;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
      ]}
    >
      <FontAwesome6 name={icon} size={16} color={colors.orange} style={styles.icon} />
      <Text style={styles.label}>{label}</Text>
      {detail && <Text style={styles.detail}>{detail}</Text>}
      <FontAwesome6 name="chevron-right" size={13} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  icon: { width: 20, textAlign: 'center' },
  label: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.textPrimary },
  detail: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginRight: 4 },
});
