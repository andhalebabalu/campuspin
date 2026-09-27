import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Button,
  Card,
  Icon,
  IconButton,
  Screen,
  SectionHeader,
  Skeleton,
  type IconName,
} from '@/components/ui';
import { EventBox, PostCard } from '@/features/community/post-card';
import { ListingTile } from '@/features/marketplace/listing-card';
import { useUnreadMessages, useUnreadNotifications } from '@/hooks/use-unread';
import { useLightStatusBar } from '@/hooks/use-status-bar';
import { useUser } from '@/lib/session';
import { communityService } from '@/services/community.service';
import { marketplaceService } from '@/services/marketplace.service';
import { colors, heroGradient, radius, shadows, space } from '@/theme/tokens';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * A student's home: what is coming up at their college, the latest from its community and new
 * listings nearby, in one screen. Unverified students are shown how to unlock it.
 */
export default function Home() {
  const user = useUser();
  useLightStatusBar();
  const insets = useSafeAreaInsets();
  const verified = user.student.verified;
  const unreadNotifications = useUnreadNotifications();
  const unreadMessages = useUnreadMessages(verified);

  const feed = useQuery({
    queryKey: ['home', 'feed'],
    enabled: verified,
    queryFn: async ({ signal }) => {
      const [events, posts, listings] = await Promise.allSettled([
        communityService.feed({ scope: 'college', category: 'EVENT', limit: 3 }, signal),
        communityService.feed({ scope: 'college', limit: 5 }, signal),
        marketplaceService.browse({ scope: 'nearby', sort: 'newest' }, signal),
      ]);
      if ([events, posts, listings].every((result) => result.status === 'rejected')) {
        throw (events as PromiseRejectedResult).reason;
      }
      return {
        events: events.status === 'fulfilled' ? events.value.data.items : [],
        posts:
          posts.status === 'fulfilled' ? posts.value.data.items.filter((post) => post.category !== 'EVENT') : [],
        listings: listings.status === 'fulfilled' ? listings.value.data.slice(0, 6) : [],
      };
    },
  });

  const actions: { label: string; icon: IconName; href: Href; badge?: number }[] = [
    { label: 'Chats', icon: 'chatbubbles', href: '/community' },
    { label: 'Sell', icon: 'add-circle', href: '/listing/new' },
    { label: 'Messages', icon: 'mail', href: '/messages', badge: unreadMessages },
    { label: 'Places', icon: 'location', href: '/explore' },
  ];

  return (
    <View style={styles.root}>
      <Screen
        padded={false}
        refreshing={feed.isRefetching}
        onRefresh={verified ? () => void feed.refetch() : undefined}
      >
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + space.md }]}
        >
          <View style={styles.glow} />
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <AppText variant="small" color="rgba(255,255,255,0.75)">
                {greeting()}
              </AppText>
              <AppText variant="title" color={colors.surface} numberOfLines={1}>
                {user.name.split(' ')[0] ?? 'there'} 👋
              </AppText>
            </View>
            <IconButton
              icon="notifications-outline"
              label="Notifications"
              tone="glass"
              badge={unreadNotifications}
              onPress={() => router.push('/notifications')}
            />
          </View>
          <View style={styles.badgeRow}>
            <Icon
              name={verified ? 'shield-checkmark' : 'shield-outline'}
              size={15}
              color={verified ? '#86efac' : 'rgba(255,255,255,0.8)'}
            />
            <AppText variant="smallStrong" color={colors.surface} numberOfLines={1}>
              {verified
                ? `Verified student · ${user.student.college?.name ?? ''}`
                : 'Not verified yet'}
            </AppText>
          </View>
        </LinearGradient>

        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => router.navigate(action.href)}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.actionIcon}>
                <Icon name={action.icon} size={22} color={colors.action} />
                {action.badge ? <View style={styles.actionDot} /> : null}
              </View>
              <AppText variant="caption" color={colors.ink}>
                {action.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.body}>
          {!verified ? (
            <VerifyCard />
          ) : feed.isPending ? (
            <View style={styles.gap}>
              <Skeleton height={120} rounded={radius.lg} />
              <Skeleton height={160} rounded={radius.lg} />
              <Skeleton height={160} rounded={radius.lg} />
            </View>
          ) : feed.isError ? (
            <Card style={styles.gap}>
              <AppText variant="subheading">Couldn’t load your feed</AppText>
              <Button title="Try again" variant="secondary" icon="refresh" onPress={() => void feed.refetch()} />
            </Card>
          ) : (
            <>
              <View>
                <SectionHeader title="Coming up" actionLabel="All events" onAction={() => router.push({ pathname: '/chat/[category]', params: { category: 'EVENT' } })} />
                {feed.data.events.length === 0 ? (
                  <Empty text="No upcoming events yet." />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
                    {feed.data.events.map((event) => (
                      <Pressable
                        key={event.id}
                        onPress={() => router.push({ pathname: '/post/[id]', params: { id: event.id } })}
                        style={styles.eventCard}
                      >
                        <AppText variant="bodyStrong" numberOfLines={2}>
                          {event.title ?? event.body}
                        </AppText>
                        {event.event ? <EventBox event={event.event} /> : null}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View>
                <SectionHeader title="Your community" actionLabel="Open chats" onAction={() => router.navigate('/community')} />
                {feed.data.posts.length === 0 ? (
                  <Empty text="Nothing posted yet. Start the conversation." />
                ) : (
                  <View style={styles.gap}>
                    {feed.data.posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </View>
                )}
              </View>

              <View>
                <SectionHeader title="New near you" actionLabel="See all" onAction={() => router.navigate('/market')} />
                {feed.data.listings.length === 0 ? (
                  <Empty text="No listings nearby yet." />
                ) : (
                  <ListingStrip listings={feed.data.listings} />
                )}
              </View>
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

function ListingStrip({ listings }: { listings: Parameters<typeof ListingTile>[0]['listing'][] }) {
  const { width } = useWindowDimensions();
  const tile = Math.min(180, width * 0.44);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
      {listings.map((listing) => (
        <ListingTile key={listing.id} listing={listing} width={tile} />
      ))}
    </ScrollView>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <AppText variant="small">{text}</AppText>
    </View>
  );
}

function VerifyCard() {
  return (
    <Card style={styles.verify}>
      <View style={styles.verifyIcon}>
        <Icon name="school" size={26} color={colors.accent} />
      </View>
      <AppText variant="heading">Unlock your campus</AppText>
      <AppText>
        Verify your college to see its events, group chats and marketplace here. It takes a minute
        with your college email, or a photo of your ID card.
      </AppText>
      <Button title="Verify my college" icon="shield-checkmark" onPress={() => router.push('/verification')} />
      <Button title="Explore places meanwhile" variant="ghost" onPress={() => router.navigate('/explore')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl + space.xl,
    borderBottomLeftRadius: radius.xl + 6,
    borderBottomRightRadius: radius.xl + 6,
    overflow: 'hidden',
    gap: space.md,
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(42,145,60,0.3)',
    top: -80,
    right: -60,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    maxWidth: '100%',
  },
  actions: {
    flexDirection: 'row',
    marginTop: -space.xxxl,
    marginHorizontal: space.lg,
    paddingVertical: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md + 2,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.pin,
    borderWidth: 2,
    borderColor: colors.actionSoft,
  },
  body: { padding: space.lg, gap: space.xxl },
  gap: { gap: space.md },
  hscroll: { gap: space.md, paddingRight: space.lg },
  eventCard: {
    width: 240,
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  empty: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
  },
  verify: { gap: space.md },
  verifyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
