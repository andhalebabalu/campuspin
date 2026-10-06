import {
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCategory,
  type CommunityChannel,
} from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppText,
  Avatar,
  Badge,
  ErrorState,
  Icon,
  ListSkeleton,
  Screen,
  SectionHeader,
  TabHeader,
} from '@/components/ui';
import { VerifyGate } from '@/components/verify-gate';
import { CATEGORY_META } from '@/features/community/meta';
import { readSeen } from '@/features/community/seen';
import { clockTime, plural } from '@/lib/format';
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

/** The college's group chats: one per topic, like WhatsApp groups. */
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

/** The college group, a grid of topic chats, and the latest message from each. */
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

  const channels = query.data?.channels ?? [];
  const totalMessages = channels.reduce((sum, channel) => sum + channel.messageCount, 0);
  const latest = channels
    .filter((channel) => channel.lastMessage !== null)
    .sort((a, b) => (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''))
    .slice(0, 5);
  const isUnread = (channel: CommunityChannel) => {
    const last = channel.lastMessage;
    return last !== null && last.authorName !== 'You' && (seen[channel.category] ?? '') < last.id;
  };
  const open = (category: CommunityCategory) =>
    router.push({ pathname: '/chat/[category]', params: { category } });

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
          <View style={styles.body}>
            <View>
              <SectionHeader title="Your College Group" />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/college/[slug]', params: { slug: query.data.college.slug } })
                }
                style={({ pressed }) => [styles.group, pressed && styles.pressed]}
              >
                <View style={styles.groupIcon}>
                  <Icon name="people" size={22} color={colors.surface} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" color={colors.brand} numberOfLines={1}>
                    {query.data.college.name}
                  </AppText>
                  <AppText variant="small">Main group · {plural(totalMessages, 'message')}</AppText>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <View style={styles.banner}>
                <Icon name="shield-checkmark" size={16} color={colors.accent} />
                <AppText variant="caption" color={colors.body} style={styles.flex}>
                  Only verified students of {query.data.college.name} can read and write here.
                </AppText>
              </View>
            </View>

            <View>
              <SectionHeader title="Categories" />
              <View style={styles.grid}>
                {channels.map((channel) => {
                  const meta = CATEGORY_META[channel.category];
                  const [, foreground] = tints[meta.tint];
                  const unread = isUnread(channel);
                  return (
                    <Pressable
                      key={channel.category}
                      accessibilityRole="button"
                      accessibilityLabel={`${COMMUNITY_CATEGORY_LABELS[channel.category]}${unread ? ', new messages' : ''}`}
                      onPress={() => open(channel.category)}
                      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                    >
                      <View style={[styles.tileIcon, { backgroundColor: foreground }]}>
                        <Icon name={meta.icon} size={22} color={colors.surface} />
                        {unread ? <View style={styles.tileDot} /> : null}
                      </View>
                      <AppText variant="caption" color={colors.ink} numberOfLines={2} style={styles.tileLabel}>
                        {COMMUNITY_CATEGORY_LABELS[channel.category]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <SectionHeader title="Latest Posts" />
              {latest.length === 0 ? (
                <View style={styles.empty}>
                  <AppText variant="small">Nothing posted yet. Pick a category and start the conversation.</AppText>
                </View>
              ) : (
                <View style={styles.posts}>
                  {latest.map((channel) => {
                    const last = channel.lastMessage;
                    if (!last) return null;
                    const meta = CATEGORY_META[channel.category];
                    return (
                      <Pressable
                        key={channel.category}
                        accessibilityRole="button"
                        onPress={() => open(channel.category)}
                        style={({ pressed }) => [styles.post, pressed && styles.pressed]}
                      >
                        <View style={styles.postHead}>
                          <Avatar name={last.authorName} size={36} />
                          <View style={styles.flex}>
                            <AppText variant="smallStrong" color={colors.ink} numberOfLines={1}>
                              {last.authorName}
                            </AppText>
                            <AppText variant="caption" color={isUnread(channel) ? colors.accent : colors.muted}>
                              {listTime(last.createdAt)}
                            </AppText>
                          </View>
                          <Badge label={COMMUNITY_CATEGORY_LABELS[channel.category]} tint={meta.tint} icon={meta.icon} />
                        </View>
                        <AppText variant="small" color={colors.ink} numberOfLines={2}>
                          {last.text}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </Screen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  body: { paddingHorizontal: space.lg, gap: space.xxl },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '31.5%',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.pin,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  tileLabel: { textAlign: 'center' },
  posts: { gap: space.md },
  post: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  empty: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
  },
});
