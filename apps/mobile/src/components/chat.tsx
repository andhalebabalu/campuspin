import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BackButton, Icon } from '@/components/ui';
import { useKeyboardVisible } from '@/components/keyboard-avoider';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** The top bar of a chat: back, an avatar/icon, a title with a subtitle, and an optional action. */
export function ChatHeader({
  leading,
  title,
  subtitle,
  onPressTitle,
  right,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string;
  onPressTitle?: () => void;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <BackButton />
      <Pressable
        disabled={!onPressTitle}
        onPress={onPressTitle}
        style={styles.headerTitle}
        accessibilityRole={onPressTitle ? 'button' : undefined}
      >
        {leading}
        <View style={styles.flex}>
          <AppText variant="subheading" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {right}
    </View>
  );
}

/** "Today" / "Yesterday" / a date, centred between messages. */
export function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.day}>
      <View style={styles.dayPill}>
        <AppText variant="caption" color={colors.body}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

/** The message box pinned under a chat. `above` holds a reply preview or extra fields. */
export function Composer({
  value,
  onChangeText,
  onSend,
  sending,
  placeholder = 'Message',
  maxLength,
  above,
  leading,
  inputRef,
  disabled = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder?: string;
  maxLength?: number;
  above?: ReactNode;
  leading?: ReactNode;
  inputRef?: React.RefObject<TextInput | null>;
  disabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // With the keyboard open there is no home indicator to keep clear of.
  const keyboardOpen = useKeyboardVisible();
  const canSend = value.trim().length > 0 && !sending && !disabled;
  return (
    <View style={[styles.composer, { paddingBottom: (keyboardOpen ? space.sm : Math.max(insets.bottom, space.sm)) + space.xs }]}>
      {above}
      <View style={styles.composerRow}>
        {leading}
        <View style={styles.inputBox}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.action}
            multiline
            maxLength={maxLength}
            editable={!disabled}
            style={styles.input}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [
            styles.send,
            !canSend && styles.sendDisabled,
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Icon name="send" size={19} color={colors.surface} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** The quoted message shown above the composer while replying. */
export function ReplyPreview({
  name,
  text,
  onCancel,
}: {
  name: string;
  text: string;
  onCancel: () => void;
}) {
  return (
    <View style={styles.reply}>
      <View style={styles.replyBar} />
      <View style={styles.flex}>
        <AppText variant="smallStrong" color={colors.action}>
          Replying to {name}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {text}
        </AppText>
      </View>
      <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Cancel reply">
        <Icon name="close-circle" size={22} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  day: { alignItems: 'center', marginVertical: space.md },
  dayPill: {
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  composer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  inputBox: {
    flex: 1,
    minHeight: 44,
    maxHeight: 130,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 22,
    backgroundColor: colors.subtle,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingTop: 11,
    paddingBottom: 11,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.lineStrong },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
  },
  replyBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.action },
});
