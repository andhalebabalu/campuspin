import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { announceInputFocus } from '@/components/keyboard-avoider';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './icon';
import { AppText } from './text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  /** Shows an eye button that reveals the text (passwords). */
  secureToggle?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, icon, secureToggle, multiline, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="smallStrong" color={colors.ink}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.box,
          multiline && styles.multilineBox,
          focused && styles.focused,
          error ? styles.errored : null,
        ]}
      >
        {icon ? <Icon name={icon} size={19} color={focused ? colors.action : colors.muted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.action}
          secureTextEntry={secureToggle ? hidden : props.secureTextEntry}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(event) => {
            setFocused(true);
            announceInputFocus();
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.multilineInput, style]}
          {...props}
        />
        {secureToggle ? (
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((value) => !value)}
          >
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.message}>
          <Icon name="alert-circle" size={14} color={colors.danger} />
          <AppText variant="small" color={colors.danger} style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : hint ? (
        <AppText variant="small" color={colors.muted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: space.xs + 2 },
  box: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  multilineBox: { alignItems: 'flex-start', paddingVertical: space.md },
  focused: { borderColor: colors.action, backgroundColor: colors.surface },
  errored: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: space.sm,
  },
  multilineInput: { minHeight: 110, paddingVertical: 0 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  flex: { flex: 1 },
});
