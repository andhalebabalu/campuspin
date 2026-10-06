import type { BusinessListing } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  type IconName,
} from '@/components/ui';
import { FeaturedSection } from '@/components/featured-section';
import { LISTING_STATUS } from '@/features/business/labels';
import { BusinessTools } from '@/features/business/tools';
import { useUnreadNotifications } from '@/hooks/use-unread';
import { useLightStatusBar } from '@/hooks/use-status-bar';
import { formatDate } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { businessService } from '@/services/business.service';
import { colors, heroGradient, radius, shadows, space } from '@/theme/tokens';

/** The business owner's home: numbers at a glance and their listings. */
export default function Dashboard() {
  useLightStatusBar();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();
  const dashboard = useQuery({
    queryKey: ['business', 'dashboard'],
    queryFn: ({ signal }) => businessService.dashboard(signal).then((r) => r.data),
  });
  const listings = useQuery({
    queryKey: ['business', 'listings'],
    queryFn: ({ signal }) => businessService.listings(signal).then((r) => r.data),
  });

  const refresh = () => {
    void dashboard.refetch();
    void listings.refetch();
  };
  const stats = dashboard.data?.stats;

  return (
    <View style={styles.root}>
      <Screen padded={false} refreshing={dashboard.isRefetching || listings.isRefetching} onRefresh={refresh}>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + space.md }]}
        >
          <View style={styles.glow} />
          <View style={styles.heroTop}>
            <View style={styles.markTile}>
              <Image source={require('@/assets/images/logo-mark.png')} style={styles.mark} contentFit="contain" />
            </View>
            <View style={styles.flex}>
              <AppText variant="small" color="rgba(255,255,255,0.75)">
                Business dashboard
              </AppText>
              <AppText variant="title" color={colors.surface} numberOfLines={1}>
                {dashboard.data?.profile.businessName ?? ' '}
              </AppText>
            </View>
            <IconButton icon="notifications-outline" label="Notifications" tone="glass" badge={unread} onPress={() => router.push('/notifications')} />
          </View>
          {dashboard.data ? (
            <View style={styles.pill}>
              <Icon
                name={dashboard.data.profile.verificationStatus === 'VERIFIED' ? 'shield-checkmark' : 'time-outline'}
                size={14}
                color={colors.surface}
              />
              <AppText variant="smallStrong" color={colors.surface}>
                {dashboard.data.profile.verificationStatus === 'VERIFIED' ? 'Verified business' : 'Verification pending'}
              </AppText>
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.statsRow}>
          <Stat icon="storefront" label="Live listings" value={stats ? `${stats.listings.live}/${stats.listings.total}` : undefined} />
          <Stat icon="mail-unread" label="New enquiries" value={stats ? String(stats.enquiries.new) : undefined} onPress={() => router.navigate('/enquiries')} />
          <Stat
            icon="star"
            iconColor="#f59e0b"
            label={stats ? `${stats.reviews.count} reviews` : 'Reviews'}
            value={stats ? (stats.reviews.count ? stats.reviews.averageRating.toFixed(1) : '–') : undefined}
            onPress={() => router.navigate('/reviews')}
          />
        </View>

        <View style={styles.body}>
          <BusinessTools
            tools={[
              { label: 'Orders', icon: 'receipt', tint: 'amber', href: '/board' },
              { label: 'Daily menu', icon: 'restaurant', tint: 'green', href: '/business/menu' },
              { label: 'Food menu', icon: 'fast-food', tint: 'rose', href: '/business/food-menu' },
              { label: 'Offers', icon: 'pricetag', tint: 'green', href: '/business/offers' },
              { label: 'QR codes', icon: 'qr-code', tint: 'violet', href: '/business/qr-codes' },
              { label: 'Services', icon: 'options', tint: 'blue', href: '/business/services' },
              { label: 'Reviews', icon: 'star', tint: 'teal', href: '/reviews' },
            ]}
          />
          <FeaturedSection />
          {dashboard.isError ? <ErrorState error={dashboard.error} onRetry={refresh} /> : null}
          {stats && stats.listings.underReview > 0 ? (
            <View style={styles.notice}>
              <Icon name="hourglass-outline" size={18} color={colors.warning} />
              <AppText variant="small" color={colors.ink} style={styles.flex}>
                {stats.listings.underReview} listing{stats.listings.underReview === 1 ? ' is' : 's are'} being checked by our team.
                Students see {stats.listings.underReview === 1 ? 'it' : 'them'} once approved.
              </AppText>
            </View>
          ) : null}

          <View style={styles.sectionHead}>
            <AppText variant="heading" style={styles.flex}>
              Your listings
            </AppText>
            <Button title="Add" icon="add" size="sm" fullWidth={false} onPress={() => router.push('/business/new-listing')} />
          </View>

          {listings.isPending ? (
            <View style={styles.gap}>
              <Skeleton height={110} rounded={radius.lg} />
              <Skeleton height={110} rounded={radius.lg} />
            </View>
          ) : listings.isError ? (
            <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
          ) : listings.data.length === 0 ? (
            <Card>
              <EmptyState
                icon="storefront-outline"
                title="List your first place"
                message="Add your mess, PG, library or shop. Once approved, students nearby can find it, review it and send you enquiries."
                actionLabel="Add a listing"
                onAction={() => router.push('/business/new-listing')}
              />
            </Card>
          ) : (
            <View style={styles.gap}>
              {listings.data.map((listing) => (
                <ListingItem key={listing.id} listing={listing} />
              ))}
            </View>
          )}
        </View>
      </Screen>
    </View>
  );
}

function Stat({
  icon,
  iconColor,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={styles.stat}>
      <Icon name={icon} size={20} color={iconColor ?? colors.action} />
      {value === undefined ? <Skeleton width={36} height={20} /> : <AppText variant="heading">{value}</AppText>}
      <AppText variant="caption" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ListingItem({ listing }: { listing: BusinessListing }) {
  const status = LISTING_STATUS[listing.status];
  const cover = mediaUrl(listing.coverImageUrl);
  return (
    <Card style={styles.listing}>
      <View style={styles.listingTop}>
        <View style={styles.thumb}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.thumbImage} contentFit="cover" />
          ) : (
            <Icon name="storefront" size={26} color={colors.placeholder} />
          )}
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {listing.name}
          </AppText>
          <AppText variant="small" numberOfLines={1}>
            {[listing.primaryCategory?.name, listing.city].filter(Boolean).join(' · ')}
          </AppText>
          <View style={styles.meta}>
            <Badge label={status.label} tint={status.tint} />
            <AppText variant="caption">Added {formatDate(listing.createdAt)}</AppText>
          </View>
        </View>
      </View>

      {listing.status === 'REJECTED' ? (
        <AppText variant="small" color={colors.danger}>
          {listing.review?.status === 'DUPLICATE' ? 'This place is already listed.' : 'Not approved.'}
          {listing.review?.note ? ` Reason: ${listing.review.note}` : ''}
        </AppText>
      ) : null}

      <View style={styles.listingStats}>
        <View style={styles.inline}>
          <Icon name="star" size={14} color="#f59e0b" />
          <AppText variant="small" color={colors.ink}>
            {listing.ratingCount > 0 ? `${listing.ratingAverage.toFixed(1)} (${listing.ratingCount})` : 'No reviews yet'}
          </AppText>
        </View>
        <Pressable
          style={styles.inline}
          onPress={() => router.navigate({ pathname: '/enquiries', params: { placeId: listing.id } })}
        >
          <Icon name="mail-outline" size={14} color={colors.action} />
          <AppText variant="smallStrong" color={colors.action}>
            {listing.enquiryCount} {listing.enquiryCount === 1 ? 'enquiry' : 'enquiries'}
            {listing.newEnquiryCount > 0 ? ` (${listing.newEnquiryCount} new)` : ''}
          </AppText>
        </Pressable>
      </View>

      {listing.status === 'ACTIVE' ? (
        <View style={styles.actions}>
          <Button
            title="Public page"
            variant="outline"
            size="sm"
            icon="open-outline"
            style={styles.flex}
            onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: listing.slug } })}
          />
          <Button
            title="Review QR"
            variant="secondary"
            size="sm"
            icon="qr-code-outline"
            style={styles.flex}
            onPress={() => router.push({ pathname: '/business/qr/[id]', params: { id: listing.id, name: listing.name } })}
          />
        </View>
      ) : null}
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
    backgroundColor: 'rgba(44,150,60,0.28)',
    top: -80,
    right: -60,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  markTile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 36, height: 36 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: -space.xxxl,
    marginHorizontal: space.lg,
    paddingVertical: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: space.xs },
  body: { padding: space.lg, gap: space.lg },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  gap: { gap: space.md },
  listing: { gap: space.md },
  listingTop: { flexDirection: 'row', gap: space.md },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 },
  listingStats: { flexDirection: 'row', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: space.sm },
});
