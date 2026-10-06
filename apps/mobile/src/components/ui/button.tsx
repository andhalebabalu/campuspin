import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { brandGradient, colors, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './icon';
import { AppText } from './text';

type Variant = 'primary' | 'success' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'light';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const HEIGHT: Record<Size, number> = { sm: 38, md: 48, lg: 54 };

const FOREGROUND: Record<Variant, string> = {
  primary: colors.surface,
  success: colors.surface,
  secondary: colors.action,
  outline: colors.ink,
  ghost: colors.action,
  danger: colors.surface,
  light: colors.action,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  const foreground = FOREGROUND[variant];
  const content: ReactNode = loading ? (
    <ActivityIndicator color={foreground} />
  ) : (
    <View style={styles.row}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 19} color={foreground} />}
      <AppText variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'} color={foreground}>
        {title}
      </AppText>
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 19} color={foreground} />}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: size === 'sm' ? space.md : space.xl },
        fullWidth ? styles.full : styles.auto,
        variantStyle[variant],
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.gradient]}
        />
      ) : null}
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gradient: { borderRadius: radius.md },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  inactive: { opacity: 0.55 },
});

const variantStyle = StyleSheet.create({
  primary: { backgroundColor: colors.action },
  /** Solid green: the go-ahead action of a screen (Directions, Sell item). */
  success: { backgroundColor: colors.go },
  secondary: { backgroundColor: colors.actionSoft },
  outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
  light: { backgroundColor: colors.surface },
});
