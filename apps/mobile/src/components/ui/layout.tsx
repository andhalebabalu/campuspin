import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { Icon, type IconName } from './icon';
import { AppText } from './text';

/**
 * A scrolling screen body. `refreshing`/`onRefresh` add pull-to-refresh; `keyboard` lifts forms
 * above the keyboard.
 */
export function Screen({
  children,
  refreshing,
  onRefresh,
  keyboard = false,
  padded = true,
  contentStyle,
  topInset = false,
  footer,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pads the top for the status bar (screens without a navigation header). */
  topInset?: boolean;
  /** Pinned under the scroll view, above the home indicator (e.g. a submit button). */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          padded && styles.padded,
          { paddingTop: (topInset ? insets.top : 0) + (padded ? space.lg : 0) },
          { paddingBottom: footer ? space.lg : insets.bottom + space.xxxl },
          contentStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.action}
              colors={[colors.action]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
      ) : null}
    </View>
  );
  return (
    <View style={styles.screen}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

/** The large title block at the top of a tab screen. */
export function TabHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabHeader, { paddingTop: insets.top + space.md }]}>
      <View style={styles.flex}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
      </View>
      {right ? <View style={styles.headerActions}>{right}</View> : null}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  badge,
  tone = 'default',
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  /** A red dot with a count, e.g. unread notifications. */
  badge?: number;
  tone?: 'default' | 'glass';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        tone === 'glass' && styles.iconButtonGlass,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name={icon} size={21} color={tone === 'glass' ? colors.surface : colors.ink} />
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="caption" color={colors.surface} style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function BackButton({ tone = 'default' }: { tone?: 'default' | 'glass' }) {
  return (
    <IconButton
      icon="chevron-back"
      label="Back"
      tone={tone}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading">{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable hitSlop={8} onPress={onAction} accessibilityRole="button">
          <AppText variant="smallStrong" color={colors.action}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A tappable settings-style row. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  danger = false,
  iconTint,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  iconTint?: readonly [string, string];
}) {
  const [background, foreground] = iconTint ?? [
    danger ? colors.dangerSoft : colors.actionSoft,
    danger ? colors.danger : colors.action,
  ];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.subtle }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: background }]}>
          <Icon name={icon} size={19} color={foreground} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={danger ? colors.danger : colors.ink}>
          {title}
        </AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.placeholder} /> : null)}
    </Pressable>
  );
}

/** A white rounded group of ListRows with dividers. */
export function RowGroup({ children }: { children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={styles.group}>
      {items.map((child, index) => (
        <View key={index}>
          {index > 0 ? <View style={styles.divider} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

/** Single-choice segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(option.value);
            }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <AppText variant="smallStrong" color={selected ? colors.ink : colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  padded: { paddingHorizontal: space.lg },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.canvas,
    gap: space.md,
  },
  headerActions: { flexDirection: 'row', gap: space.sm },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  iconButtonGlass: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.pin,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.lg },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.subtle,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.surface, ...shadows.sm },
});
