import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, radius, space, tints, type Tint } from '@/theme/tokens';
import { Icon, type IconName } from './icon';
import { AppText } from './text';

/** A small read-only label: status, category, condition. */
export function Badge({
  label,
  tint = 'slate',
  icon,
}: {
  label: string;
  tint?: Tint;
  icon?: IconName;
}) {
  const [background, foreground] = tints[tint];
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      {icon ? <Icon name={icon} size={12} color={foreground} /> : null}
      <AppText variant="caption" color={foreground}>
        {label}
      </AppText>
    </View>
  );
}

/** A selectable filter pill. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={selected ? colors.surface : colors.body} /> : null}
      <AppText variant="smallStrong" color={selected ? colors.surface : colors.body}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A horizontally scrolling row of single-choice chips. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          icon={option.icon}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.line },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
});
