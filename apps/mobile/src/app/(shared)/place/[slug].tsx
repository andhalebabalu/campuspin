import type { PlaceDetail, PublicReview, REVIEW_SORTS } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StarInput, Stars } from '@/components/stars';
import {
  AppText,
  BackButton,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingView,
  Segmented,
  type IconName,
} from '@/components/ui';
import { categoryPhoto, formatPlacePrice, iconFor, UNIT_LABELS } from '@/features/places/meta';
import { isApiError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { useUser } from '@/lib/session';
import { placesService } from '@/services/places.service';
import { reviewsService } from '@/services/reviews.service';
import { colors, radius, shadows, space } from '@/theme/tokens';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hoursText(hour: PlaceDetail['hours'][number]): string {
  if (hour.isClosed) return 'Closed';
  if (hour.is24Hours) return 'Open 24 hours';
  const slot = hour.slotLabel ? `${hour.slotLabel} ` : '';
  return `${slot}${hour.openTime ?? ''}–${hour.closeTime ?? ''}`;
}

function directionsUrl(place: PlaceDetail): string {
  return (
    place.googleMapsUrl ?? `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
  );
}

/** One place: photos, prices, hours, map, contact, reviews and an enquiry button. */
export default function PlaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ['place', slug],
    queryFn: ({ signal }) => placesService.getBySlug(slug, signal).then((r) => r.data),
  });

  const back = (
    <View style={[styles.floating, { top: insets.top + space.xs }]}>
      <BackButton />
    </View>
  );

  if (query.isPending) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingView />
        {back}
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 60 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {isApiError(query.error, 404) ? (
          <EmptyState icon="location-outline" title="Place not found" message="It may have closed or been removed." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
        {back}
      </View>
    );
  }
  return <PlaceView place={query.data} back={back} />;
}

function PlaceView({ place, back }: { place: PlaceDetail; back: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const user = useUser();
  const isStudent = user.roles.includes('STUDENT');
  const [photo, setPhoto] = useState(0);
  const photos = [...place.images].sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
  const stock = photos.length === 0 ? categoryPhoto(place.categories.find((c) => c.isPrimary)?.slug ?? place.primaryCategory?.slug) : undefined;
  const heroHeight = width * 0.75;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={{ height: heroHeight }}>
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => setPhoto(Math.round(event.nativeEvent.contentOffset.x / width))}
            >
              {photos.map((image) => (
                <Image
                  key={image.id}
                  source={{ uri: mediaUrl(image.imageUrl) }}
                  style={{ width, height: heroHeight }}
                  contentFit="cover"
                  transition={200}
                  accessibilityLabel={image.altText ?? undefined}
                />
              ))}
            </ScrollView>
          ) : stock ? (
            <Image source={stock} style={{ width, height: heroHeight }} contentFit="cover" />
          ) : (
            <View style={[styles.heroPlaceholder, { height: heroHeight }]}>
              <Icon name={iconFor(place.primaryCategory?.icon)} size={56} color={colors.primaryBorder} />
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(4,35,73,0.85)']} style={styles.heroShade} pointerEvents="none" />
          {stock ? (
            <View style={styles.illustrative}>
              <AppText variant="caption" color={colors.surface}>
                Illustrative photo
              </AppText>
            </View>
          ) : null}
          {photos.length > 1 ? (
            <View style={styles.counter}>
              <AppText variant="caption" color={colors.surface}>
                {photo + 1}/{photos.length}
              </AppText>
            </View>
          ) : null}
          <View style={styles.heroText} pointerEvents="none">
            <View style={styles.badges}>
              {place.primaryCategory ? <Badge label={place.primaryCategory.name} tint="blue" /> : null}
              {place.verified ? <Badge label="Verified" tint="green" icon="checkmark-circle" /> : null}
            </View>
            <AppText variant="title" color={colors.surface}>
              {place.name}
            </AppText>
            <AppText variant="small" color="rgba(255,255,255,0.85)" numberOfLines={1}>
              {place.address}
            </AppText>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.statsRow}>
            <Stat
              icon="star"
              iconColor="#f59e0b"
              value={place.ratingCount > 0 ? place.ratingAverage.toFixed(1) : '–'}
              label={place.ratingCount > 0 ? `${place.ratingCount} reviews` : 'No reviews'}
            />
            <Stat icon="cash-outline" value={formatPlacePrice(place.priceMin, place.priceMax, place.priceUnit).split(' / ')[0] ?? ''} label={place.priceUnit ? `per ${UNIT_LABELS[place.priceUnit]}` : 'Price'} />
            <Stat icon="location-outline" value={place.city} label={place.state} />
          </View>

          <View style={styles.quickActions}>
            <QuickAction icon="navigate" label="Directions" onPress={() => void Linking.openURL(directionsUrl(place))} />
            {place.phone ? (
              <QuickAction icon="call" label="Call" onPress={() => void Linking.openURL(`tel:${place.phone}`)} />
            ) : null}
            {place.website ? (
              <QuickAction icon="globe-outline" label="Website" onPress={() => void Linking.openURL(place.website!)} />
            ) : null}
            {isStudent ? (
              <QuickAction
                icon="star-outline"
                label="Review"
                onPress={() => router.push({ pathname: '/place/review/[slug]', params: { slug: place.slug } })}
              />
            ) : null}
          </View>

          {place.description ? (
            <Card style={styles.gap}>
              <AppText variant="subheading">About</AppText>
              <AppText>{place.description}</AppText>
            </Card>
          ) : null}

          {place.priceOptions.length > 0 ? (
            <Card style={styles.gap}>
              <AppText variant="subheading">Prices</AppText>
              {place.priceOptions.map((option) => (
                <View key={option.id} style={styles.priceLine}>
                  <View style={styles.flex}>
                    <AppText color={colors.ink}>{option.label}</AppText>
                    {option.note ? <AppText variant="small">{option.note}</AppText> : null}
                  </View>
                  <AppText variant="bodyStrong" color={colors.action}>
                    ₹{option.amount.toLocaleString('en-IN')}
                    <AppText variant="small"> / {UNIT_LABELS[option.unit]}</AppText>
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}

          {place.amenities.length > 0 ? (
            <Card style={styles.gap}>
              <AppText variant="subheading">Amenities</AppText>
              <View style={styles.amenities}>
                {place.amenities.map((amenity) => (
                  <View key={amenity.id} style={styles.amenity}>
                    <Icon name={iconFor(amenity.icon, 'checkmark-circle')} size={16} color={colors.accent} />
                    <AppText variant="small" color={colors.ink}>
                      {amenity.name}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {place.hours.length > 0 ? (
            <Card style={styles.gap}>
              <AppText variant="subheading">Opening hours</AppText>
              {[...place.hours]
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sortOrder - b.sortOrder)
                .map((hour) => (
                  <View key={hour.id} style={styles.hourLine}>
                    <AppText variant="small" color={colors.ink} style={styles.day}>
                      {DAY_LABELS[hour.dayOfWeek - 1]}
                    </AppText>
                    <AppText variant="small" color={hour.isClosed ? colors.danger : colors.body}>
                      {hoursText(hour)}
                    </AppText>
                  </View>
                ))}
            </Card>
          ) : null}

          <Card padded={false} style={styles.mapCard}>
            <MapView
              style={styles.map}
              liteMode={Platform.OS === 'android'}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              initialRegion={{ latitude: place.latitude, longitude: place.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            >
              <Marker coordinate={{ latitude: place.latitude, longitude: place.longitude }} title={place.name} />
            </MapView>
            <Pressable style={styles.mapFoot} onPress={() => void Linking.openURL(directionsUrl(place))}>
              <Icon name="location" size={18} color={colors.action} />
              <AppText variant="small" color={colors.ink} style={styles.flex} numberOfLines={2}>
                {place.address}
              </AppText>
              <AppText variant="smallStrong" color={colors.action}>
                Open map
              </AppText>
            </Pressable>
          </Card>

          <Reviews place={place} canReview={isStudent} />
        </View>
      </ScrollView>

      {place.acceptsEnquiries && isStudent ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
          <Button
            title="Send an enquiry"
            size="lg"
            icon="mail"
            onPress={() => router.push({ pathname: '/place/enquire/[slug]', params: { slug: place.slug, name: place.name } })}
          />
        </View>
      ) : null}
      {back}
    </View>
  );
}

function Stat({ icon, iconColor, value, label }: { icon: IconName; iconColor?: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={18} color={iconColor ?? colors.action} />
      <AppText variant="bodyStrong" numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="caption" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.75 }]}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={20} color={colors.action} />
      </View>
      <AppText variant="caption" color={colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

const SORTS: { value: (typeof REVIEW_SORTS)[number]; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
];

function Reviews({ place, canReview }: { place: PlaceDetail; canReview: boolean }) {
  const [sort, setSort] = useState<(typeof REVIEW_SORTS)[number]>('recent');
  const summary = useQuery({
    queryKey: ['reviews', place.slug, 'summary'],
    queryFn: ({ signal }) => reviewsService.summary(place.slug, signal).then((r) => r.data),
  });
  const list = useQuery({
    queryKey: ['reviews', place.slug, sort],
    queryFn: ({ signal }) => reviewsService.listForPlace(place.slug, { sort, limit: 20 }, signal).then((r) => r.data),
  });
  const total = summary.data?.ratingCount ?? 0;

  return (
    <View style={styles.gap}>
      <AppText variant="heading">Reviews</AppText>
      {summary.data && total > 0 ? (
        <Card style={styles.summary}>
          <View style={styles.summaryLeft}>
            <AppText variant="hero">{summary.data.ratingAverage.toFixed(1)}</AppText>
            <Stars value={summary.data.ratingAverage} />
            <AppText variant="caption">{total} reviews</AppText>
          </View>
          <View style={styles.flex}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.data.histogram.find((entry) => entry.rating === star)?.count ?? 0;
              return (
                <View key={star} style={styles.histRow}>
                  <AppText variant="caption" style={styles.histLabel}>
                    {star}
                  </AppText>
                  <View style={styles.histTrack}>
                    <View style={[styles.histFill, { width: `${total ? (count / total) * 100 : 0}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {canReview ? (
        <Card style={styles.writeCard}>
          <AppText variant="subheading">Been here?</AppText>
          <AppText variant="small">Your review helps other students choose.</AppText>
          <StarInput
            value={0}
            size={30}
            onChange={(rating) =>
              router.push({ pathname: '/place/review/[slug]', params: { slug: place.slug, rating: String(rating) } })
            }
          />
        </Card>
      ) : null}

      {total > 0 ? <Segmented options={SORTS} value={sort} onChange={setSort} /> : null}
      {list.isPending ? (
        <LoadingView />
      ) : (list.data ?? []).length === 0 ? (
        <AppText variant="small">No reviews yet.</AppText>
      ) : (
        (list.data ?? []).map((review) => <ReviewItem key={review.id} review={review} />)
      )}
    </View>
  );
}

function ReviewItem({ review }: { review: PublicReview }) {
  return (
    <Card style={styles.review}>
      <View style={styles.reviewHead}>
        <AppText variant="bodyStrong" style={styles.flex}>
          {review.authorName}
        </AppText>
        <AppText variant="caption">{formatDate(review.createdAt)}</AppText>
      </View>
      <Stars value={review.rating} />
      {review.comment ? <AppText color={colors.ink}>{review.comment}</AppText> : null}
      {review.dimensionRatings.length > 0 ? (
        <View style={styles.dims}>
          {review.dimensionRatings.map((dimension) => (
            <Badge key={dimension.dimensionId} label={`${dimension.label} ${dimension.rating}★`} tint="slate" />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  floating: { position: 'absolute', left: space.lg },
  heroPlaceholder: { backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  heroText: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.xxl + space.md, gap: 4 },
  illustrative: {
    position: 'absolute',
    top: 60,
    right: space.lg,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counter: {
    position: 'absolute',
    top: 60,
    right: space.lg,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  badges: { flexDirection: 'row', gap: space.xs + 2 },
  body: {
    marginTop: -space.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.canvas,
    padding: space.lg,
    gap: space.lg,
  },
  statsRow: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingVertical: space.md,
    ...shadows.sm,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: space.xs },
  quickActions: { flexDirection: 'row', justifyContent: 'space-around' },
  quick: { alignItems: 'center', gap: 6 },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: { gap: space.md },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  hourLine: { flexDirection: 'row', gap: space.md },
  day: { width: 96 },
  mapCard: { overflow: 'hidden' },
  map: { height: 170 },
  mapFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  summary: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  summaryLeft: { alignItems: 'center', gap: 2 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: 2 },
  histLabel: { width: 10 },
  histTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.subtle, overflow: 'hidden' },
  histFill: { height: '100%', borderRadius: 4, backgroundColor: '#f59e0b' },
  writeCard: { gap: space.sm, alignItems: 'center' },
  review: { gap: space.xs + 2 },
  reviewHead: { flexDirection: 'row', alignItems: 'center' },
  dims: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
