import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Icon } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

/** A message above a form: an error the form as a whole got, or a success note. */
export function FormAlert({
  message,
  tone = 'error',
  children,
}: {
  message: string;
  tone?: 'error' | 'success' | 'info';
  children?: ReactNode;
}) {
  const [background, foreground, icon] =
    tone === 'error'
      ? [colors.dangerSoft, colors.danger, 'alert-circle' as const]
      : tone === 'success'
        ? [colors.successSoft, colors.success, 'checkmark-circle' as const]
        : [colors.actionSoft, colors.action, 'information-circle' as const];
  return (
    <View style={[styles.alert, { backgroundColor: background }]}>
      <Icon name={icon} size={19} color={foreground} />
      <View style={styles.body}>
        <AppText variant="small" color={colors.ink}>
          {message}
        </AppText>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  body: { flex: 1, gap: space.sm },
});
