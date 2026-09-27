import { Text, type TextProps } from 'react-native';
import { colors, type TypeVariant, type as typeScale } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** All text in the app goes through this, so every screen uses the same type scale. */
export function AppText({ variant = 'body', color, align, style, ...props }: AppTextProps) {
  const defaultColor =
    variant === 'body' || variant === 'small' ? colors.body : variant === 'caption' ? colors.muted : colors.ink;
  return (
    <Text
      {...props}
      style={[typeScale[variant], { color: color ?? defaultColor, textAlign: align }, style]}
    />
  );
}
