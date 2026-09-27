import { COMMUNITY_CATEGORY_LABELS } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, ErrorState, Icon, ListSkeleton, Screen, TabHeader } from '@/components/ui';
import { VerifyGate } from '@/components/verify-gate';
import { CATEGORY_META } from '@/features/community/meta';
import { readSeen } from '@/features/community/seen';
import { clockTime } from '@/lib/format';
import { useUser } from '@/lib/session';
import { communityService } from '@/services/community.service';
import { colors, radius, shadows, space, tints } from '@/theme/tokens';

const POLL_MS = 20_000;

function listTime(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? clockTime(iso)
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** The college's group chats: one per section, like WhatsApp groups. */
export default function Community() {
  const user = useUser();
  if (!user.student.verified) {
    return (
      <View style={styles.root}>
        <TabHeader title="Community" />
        <VerifyGate
          icon="chatbubbles"
          title="Your college’s group chats"
          message="Questions, notes, events, jobs, lost & found: one chat per topic, only for verified students of your college."
        />
      </View>
    );
  }
  return <Channels />;
}

function Channels() {
  const [seen, setSeen] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ['community', 'channels'],
    queryFn: ({ signal }) => communityService.channels(signal).then((r) => r.data),
    refetchInterval: POLL_MS,
  });

  // Coming back from a chat: re-read what was seen, so its unread dot clears.
  useFocusEffect(
    useCallback(() => {
      void readSeen().then(setSeen);
      void query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={styles.root}>
      <TabHeader
        title="Community"
        subtitle={query.data ? query.data.college.name : 'Your college’s group chats'}
      />
      {query.isPending ? (
        <ListSkeleton count={6} height={76} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Screen
          padded={false}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        >
          <View style={styles.banner}>
            <Icon name="shield-checkmark" size={18} color={colors.accent} />
            <AppText variant="small" style={styles.flex}>
              Only verified students of {query.data.college.name} can read and write here.
            </AppText>
          </View>
          <View style={styles.list}>
            {query.data.channels.map((channel) => {
              const meta = CATEGORY_META[channel.category];
              const [background, foreground] = tints[meta.tint];
              const last = channel.lastMessage;
              const unread =
                last !== null && last.authorName !== 'You' && (seen[channel.category] ?? '') < last.id;
              return (
                <Pressable
                  key={channel.category}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/chat/[category]', params: { category: channel.category } })
                  }
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.subtle }]}
                >
                  <View style={[styles.icon, { backgroundColor: background }]}>
                    <Icon name={meta.icon} size={22} color={foreground} />
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.topLine}>
                      <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                        {COMMUNITY_CATEGORY_LABELS[channel.category]}
                      </AppText>
                      {last ? (
                        <AppText variant="caption" color={unread ? colors.accent : colors.muted}>
                          {listTime(last.createdAt)}
                        </AppText>
                      ) : null}
                    </View>
                    <View style={styles.topLine}>
                      <AppText variant="small" numberOfLines={1} style={styles.flex}>
                        {last ? `${last.authorName}: ${last.text}` : meta.hint}
                      </AppText>
                      {unread ? <View style={styles.dot} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Screen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  list: {
    marginHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
