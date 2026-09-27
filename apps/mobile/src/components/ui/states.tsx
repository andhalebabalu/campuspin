import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { errorMessage } from '@/lib/errors';
import { colors, radius, space } from '@/theme/tokens';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { AppText } from './text';

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.action} />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText align="center" style={styles.emptyMessage}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="cloud-offline-outline" size={30} color={colors.danger} />
      </View>
      <AppText variant="heading" align="center">
        Couldn’t load this
      </AppText>
      <AppText align="center" style={styles.emptyMessage}>
        {errorMessage(error)}
      </AppText>
      {onRetry ? (
        <Button
          title="Try again"
          icon="refresh"
          variant="secondary"
          onPress={onRetry}
          fullWidth={false}
          style={styles.emptyAction}
        />
      ) : null}
    </View>
  );
}

export function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.action} />
    </View>
  );
}

/** A pulsing placeholder block for content that is still loading. */
export function Skeleton({
  width = '100%',
  height = 14,
  rounded = radius.sm,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
}) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{ width, height, borderRadius: rounded, backgroundColor: colors.line, opacity }}
    />
  );
}

/** A stack of card-shaped skeletons for list screens. */
export function ListSkeleton({ count = 4, height = 96 }: { count?: number; height?: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.skeletonCard, { height }]}>
          <Skeleton width={44} height={44} rounded={22} />
          <View style={styles.skeletonLines}>
            <Skeleton width="60%" />
            <Skeleton width="90%" height={12} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.xxxl + space.lg,
    gap: space.sm,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyMessage: { maxWidth: 320 },
  emptyAction: { marginTop: space.md, alignSelf: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxxl },
  skeletonList: { gap: space.md, padding: space.lg },
  skeletonCard: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  skeletonLines: { flex: 1, gap: space.sm },
});
