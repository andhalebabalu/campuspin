import { COMMUNITY_CATEGORY_LABELS, type CommunityPost } from '@platform/contracts';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Avatar, Badge, Icon } from '@/components/ui';
import { eventTime, timeAgo } from '@/lib/format';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { CATEGORY_META } from './meta';

/** A community post as a card (feed, member profile). Opens the post with its comments. */
export function PostCard({ post }: { post: CommunityPost }) {
  const meta = CATEGORY_META[post.category];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Avatar name={post.author.displayName} imageUrl={post.author.avatarUrl} size={36} verified={post.author.verifiedStudent} />
        <View style={styles.flex}>
          <AppText variant="smallStrong" color={colors.ink} numberOfLines={1}>
            {post.author.displayName}
          </AppText>
          <AppText variant="caption">{timeAgo(post.createdAt)}</AppText>
        </View>
        <Badge label={COMMUNITY_CATEGORY_LABELS[post.category]} tint={meta.tint} icon={meta.icon} />
      </View>
      {post.title ? <AppText variant="subheading">{post.title}</AppText> : null}
      <AppText numberOfLines={4}>{post.body}</AppText>
      {post.event ? <EventBox event={post.event} /> : null}
      <View style={styles.foot}>
        <View style={styles.stat}>
          <Icon name={post.myReaction ? 'heart' : 'heart-outline'} size={16} color={post.myReaction ? colors.danger : colors.muted} />
          <AppText variant="small">{post.reactionCount}</AppText>
        </View>
        <View style={styles.stat}>
          <Icon name="chatbubble-outline" size={15} color={colors.muted} />
          <AppText variant="small">{post.commentCount}</AppText>
        </View>
        {post.visibility === 'PUBLIC' ? (
          <View style={styles.stat}>
            <Icon name="globe-outline" size={15} color={colors.muted} />
            <AppText variant="small">Public</AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function EventBox({ event }: { event: NonNullable<CommunityPost['event']> }) {
  return (
    <View style={styles.event}>
      <View style={styles.eventIcon}>
        <Icon name="calendar" size={18} color={colors.warning} />
      </View>
      <View style={styles.flex}>
        <AppText variant="smallStrong" color={colors.ink}>
          {eventTime(event.startsAt)}
        </AppText>
        {event.location ? <AppText variant="small">{event.location}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  pressed: { opacity: 0.92 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  foot: { flexDirection: 'row', gap: space.lg, marginTop: space.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  eventIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
