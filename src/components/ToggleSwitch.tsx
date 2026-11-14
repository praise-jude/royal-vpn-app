import { Pressable, View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function ToggleSwitch({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.track, { backgroundColor: value ? colors.blue : 'rgba(255,255,255,0.15)' }]}
    >
      <View style={[styles.thumb, { left: value ? 22 : 2 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 46,
    height: 26,
    borderRadius: 9999,
  },
  thumb: {
    position: 'absolute',
    top: 2,
    width: 22,
    height: 22,
    borderRadius: 9999,
    backgroundColor: '#fff',
  },
});
