import type { StudentHome } from '@platform/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  Screen,
  SectionHeader,
  Skeleton,
  type IconName,
} from '@/components/ui';
import { FeaturedSection } from '@/components/featured-section';
import { PostCard } from '@/features/community/post-card';
import { OrderCard } from '@/features/orders/order-card';
import { OfferCard } from '@/features/offers/offer-card';
import { RequestCard } from '@/features/requests/request-card';
import { BookingCard } from '@/features/bookings/booking-panel';
import { MessMenuCard } from '@/features/services/menu-card';
import { QuickActions } from '@/features/services/quick-actions';
import { PlaceCard } from '@/features/places/place-card';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { ListingTile } from '@/features/marketplace/listing-card';
import { useUnreadMessages, useUnreadNotifications } from '@/hooks/use-unread';
import { eventTime } from '@/lib/format';
import { useUser } from '@/lib/session';
import { communityService } from '@/services/community.service';
import { marketplaceService } from '@/services/marketplace.service';
import { servicesService } from '@/services/services.service';
import { colors, heroGradient, palette, radius, shadows, space } from '@/theme/tokens';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * A student's home: their college standing, shortcuts, what is coming up at their college, the
 * latest from its community and new listings nearby. Unverified students are shown how to unlock it.
 */
export default function Home() {
  const user = useUser();
  const insets = useSafeAreaInsets();
  const verified = user.student.verified;
  const college = user.student.college ?? user.college;
  const unreadNotifications = useUnreadNotifications();
  const unreadMessages = useUnreadMessages(verified);

  const location = useDeviceLocation();
  const daily = useQuery({
    queryKey: ['home', 'daily', location.point],
    enabled: location.ready,
    queryFn: ({ signal }) => servicesService.home(location.point, signal).then((r) => r.data),
  });

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

  const actions: { label: string; icon: IconName; tint: readonly [string, string]; href: Href; badge?: number }[] = [
    { label: 'Market', icon: 'pricetags', tint: [palette.pin50, palette.pin500], href: '/market' },
    { label: 'Sell', icon: 'cart', tint: [palette.accent50, palette.accent400], href: '/listing/new' },
    { label: 'Community', icon: 'people', tint: [palette.primary50, palette.primary700], href: '/community' },
    {
      label: 'Messages',
      icon: 'chatbubble-ellipses',
      tint: [palette.primary50, palette.primary700],
      href: '/messages',
      badge: unreadMessages,
    },
  ];

  return (
    <View style={styles.root}>
      <Screen
        padded={false}
        refreshing={feed.isRefetching || daily.isRefetching}
        onRefresh={() => {
          void daily.refetch();
          if (verified) void feed.refetch();
        }}
      >
        <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
          <View style={styles.topBar}>
            <Image
              source={require('@/assets/images/logo-wordmark.png')}
              style={styles.wordmark}
              contentFit="contain"
              accessibilityLabel="CampusPin"
            />
            <View style={styles.topActions}>
              <IconButton icon="qr-code-outline" label="Scan a CampusPin code" onPress={() => router.push('/scan')} />
              <IconButton
                icon="notifications-outline"
                label="Notifications"
                badge={unreadNotifications}
                onPress={() => router.push('/notifications')}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.navigate('/me')}>
                <Avatar name={user.name} imageUrl={user.avatarUrl} size={42} verified={verified} />
              </Pressable>
            </View>
          </View>

          <View>
            <AppText variant="small">{greeting()},</AppText>
            <AppText variant="title" color={colors.brand} numberOfLines={1}>
              {user.name.split(' ')[0] ?? 'there'} 👋
            </AppText>
          </View>

          <Pressable
            accessibilityRole="search"
            onPress={() => router.navigate('/explore')}
            style={({ pressed }) => [styles.search, pressed && styles.pressed]}
          >
            <Icon name="search" size={20} color={colors.muted} />
            <AppText color={colors.muted}>What do you need today?</AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              verified && college
                ? router.push({ pathname: '/college/[slug]', params: { slug: college.slug } })
                : router.push('/verification')
            }
            style={({ pressed }) => [styles.collegeCard, !verified && styles.collegeCardPending, pressed && styles.pressed]}
          >
            <View style={[styles.collegeTick, !verified && { backgroundColor: colors.warning }]}>
              <Icon name={verified ? 'checkmark' : 'shield-outline'} size={16} color={colors.surface} />
            </View>
            <View style={styles.flex}>
              <AppText variant="smallStrong" color={verified ? colors.accent : colors.warning}>
                {verified ? 'Verified College' : 'Not verified yet'}
              </AppText>
              <AppText variant="small" color={colors.ink} numberOfLines={1}>
                {verified
                  ? (college?.name ?? '')
                  : college
                    ? `Verify for ${college.name}`
                    : 'Verify your college to unlock everything'}
              </AppText>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => router.navigate(action.href)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.tint[0] }]}>
                <Icon name={action.icon} size={24} color={action.tint[1]} />
                {action.badge ? <View style={styles.actionDot} /> : null}
              </View>
              <AppText variant="caption" color={colors.ink} numberOfLines={1}>
                {action.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.body}>
          <DailySection daily={daily} />
          <FeaturedSection />
          <EssentialsBanner />

          {!verified ? (
            <VerifyCard />
          ) : feed.isPending ? (
            <View style={styles.gap}>
              <Skeleton height={96} rounded={radius.lg} />
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
                <SectionHeader
                  title="Upcoming Events"
                  actionLabel="See all"
                  onAction={() => router.push({ pathname: '/chat/[category]', params: { category: 'EVENT' } })}
                />
                {feed.data.events.length === 0 ? (
                  <Empty text="No upcoming events yet." />
                ) : (
                  <View style={styles.gap}>
                    {feed.data.events.map((event) => (
                      <Card
                        key={event.id}
                        onPress={() => router.push({ pathname: '/post/[id]', params: { id: event.id } })}
                        style={styles.eventCard}
                      >
                        <View style={styles.eventIcon}>
                          <Icon name="calendar" size={24} color={colors.brand} />
                        </View>
                        <View style={styles.flex}>
                          <AppText variant="bodyStrong" color={colors.brand} numberOfLines={1}>
                            {event.title ?? event.body}
                          </AppText>
                          {event.event ? (
                            <AppText variant="caption" numberOfLines={1}>
                              {[eventTime(event.event.startsAt), event.event.location].filter(Boolean).join('  |  ')}
                            </AppText>
                          ) : null}
                        </View>
                        <Badge label="Upcoming" tint="green" />
                      </Card>
                    ))}
                  </View>
                )}
              </View>

              <View>
                <SectionHeader title="Latest Posts" actionLabel="See all" onAction={() => router.navigate('/community')} />
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
                <SectionHeader title="Nearby Listings" actionLabel="See all" onAction={() => router.navigate('/market')} />
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

/** Quick actions, today's mess menus and saved places: the daily-use part of home. */
function DailySection({ daily }: { daily: UseQueryResult<StudentHome> }) {
  const { width } = useWindowDimensions();
  if (daily.isPending) {
    return (
      <View style={styles.gap}>
        <Skeleton height={150} rounded={radius.lg} />
        <Skeleton height={180} rounded={radius.lg} />
      </View>
    );
  }
  if (daily.isError || !daily.data) {
    return (
      <Card style={styles.gap}>
        <AppText variant="subheading">Couldn’t load your quick actions</AppText>
        <Button title="Try again" variant="secondary" icon="refresh" onPress={() => void daily.refetch()} />
      </Card>
    );
  }
  const { quickActions, activeOrders, activeRequests, upcomingBookings, nearbyOffers, todaysMenus, saved, recentPlaces } = daily.data;
  return (
    <>
      {quickActions.length > 0 ? (
        <View>
          <SectionHeader title="Quick Actions" />
          <QuickActions actions={quickActions} />
        </View>
      ) : null}

      {activeOrders.length > 0 || activeRequests.length > 0 || upcomingBookings.length > 0 ? (
        <View>
          <SectionHeader title="On the way" actionLabel="All orders" onAction={() => router.navigate('/orders')} />
          <View style={styles.gap}>
            {activeOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
            {upcomingBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
            {activeRequests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <SectionHeader title="🍱 Today’s Mess Menu" actionLabel="See all" onAction={() => router.push('/menus')} />
        {todaysMenus.length === 0 ? (
          <Empty text="No mess has published today’s menu yet. Save your mess to hear first." />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
            {todaysMenus.map((card) => (
              <MessMenuCard key={card.place.id} card={card} width={Math.min(320, width * 0.82)} />
            ))}
          </ScrollView>
        )}
      </View>

      {nearbyOffers.length > 0 ? (
        <View>
          <SectionHeader title="🎁 Student Offers" actionLabel="See all" onAction={() => router.push('/offers')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
            {nearbyOffers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} width={Math.min(280, width * 0.75)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {recentPlaces.length > 0 ? (
        <View>
          <SectionHeader title="Recently Used" />
          <View style={styles.gap}>
            {recentPlaces.slice(0, 3).map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </View>
        </View>
      ) : null}

      {saved.length > 0 ? (
        <View>
          <SectionHeader title="Saved Places" actionLabel="See all" onAction={() => router.push('/saved')} />
          <View style={styles.gap}>
            {saved.slice(0, 3).map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

/** "Student essentials near you": the way into Explore, as a navy banner with a photo. */
function EssentialsBanner() {
  return (
    <View>
      <SectionHeader title="Featured Services" actionLabel="See all" onAction={() => router.navigate('/explore')} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Student essentials near you. Explore now"
        onPress={() => router.navigate('/explore')}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <Image
          source={require('@/assets/images/categories/libraries.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={[heroGradient[0], heroGradient[1], 'rgba(18,61,115,0.25)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.bannerBody}>
          <AppText variant="title" color={colors.surface}>
            Student Essentials{'\n'}Near You
          </AppText>
          <AppText variant="small" color="rgba(255,255,255,0.85)">
            Mess • Rooms • Study • More
          </AppText>
          <View style={styles.bannerButton}>
            <AppText variant="smallStrong" color={colors.surface}>
              Explore Now
            </AppText>
            <Icon name="arrow-forward" size={15} color={colors.surface} />
          </View>
        </View>
      </Pressable>
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
      <AppText variant="heading" color={colors.brand}>
        Unlock your campus
      </AppText>
      <AppText>
        Verify your college to see its events, group chats and marketplace here. It takes a minute
        with your college email, or a photo of your ID card.
      </AppText>
      <Button title="Verify my college" variant="success" icon="shield-checkmark" onPress={() => router.push('/verification')} />
      <Button title="Explore places meanwhile" variant="ghost" onPress={() => router.navigate('/explore')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.lg,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.sm,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 50,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.subtle,
    borderWidth: 1,
    borderColor: colors.line,
  },
  wordmark: { width: 150, height: 32 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  collegeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: palette.accent100,
    ...shadows.sm,
  },
  collegeCardPending: { borderColor: palette.amber50 },
  collegeTick: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.go,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.pin,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  body: { padding: space.lg, gap: space.xxl },
  gap: { gap: space.md },
  hscroll: { gap: space.md, paddingRight: space.lg },
  banner: {
    height: 170,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.brand,
    ...shadows.md,
  },
  bannerBody: { flex: 1, justifyContent: 'center', gap: space.xs, padding: space.lg },
  bannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.go,
  },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
