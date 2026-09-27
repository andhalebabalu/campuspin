import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/tokens';
import { Icon } from './ui';

const GOLD = '#f59e0b';

/** Read-only stars, e.g. on a review. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name={value >= star ? 'star' : value >= star - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={value >= star - 0.5 ? GOLD : colors.lineStrong}
        />
      ))}
    </View>
  );
}

/** Tap-to-rate stars. */
export function StarInput({
  value,
  onChange,
  size = 34,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  label?: string;
}) {
  return (
    <View style={[styles.row, { gap: size * 0.18 }]} accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            onChange(star);
          }}
        >
          <Icon name={value >= star ? 'star' : 'star-outline'} size={size} color={value >= star ? GOLD : colors.lineStrong} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 1 },
});
