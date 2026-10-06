import type { PlaceCard } from '@platform/contracts';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Icon } from '@/components/ui';
import { mediaUrl } from '@/lib/media';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { categoryPhoto, formatDistance, formatPlacePrice, iconFor } from './meta';

/**
 * A place on the Explore list: photo, category tag, name, price, rating, distance, a bookmark and
 * a green View Details button.
 */
export function ExplorePlaceCard({
  place,
  saved,
  onToggleSave,
}: {
  place: PlaceCard;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const photo = mediaUrl(place.coverImageUrl);
  const stock = photo ? undefined : categoryPhoto(place.primaryCategory?.slug);
  const distance = formatDistance(place.distanceMeters);
  const open = () => router.push({ pathname: '/place/[slug]', params: { slug: place.slug } });
  // A known price says more than the town; without one, show where it is.
  const subtitle =
    place.priceMin !== null
      ? formatPlacePrice(place.priceMin, place.priceMax, place.priceUnit)
      : `${place.city}${place.verified ? ' · Verified' : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.imageWrap}>
        {photo || stock ? (
          <Image
            source={photo ? { uri: photo } : stock}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Icon
              name={iconFor(place.primaryCategory?.icon)}
              size={30}
              color={colors.placeholder}
            />
          </View>
        )}
        {place.verified ? (
          <View style={styles.verified}>
            <Icon name="checkmark" size={12} color={colors.surface} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {place.primaryCategory ? (
          <View style={styles.tag}>
            <AppText variant="caption" color={colors.accent}>
              {place.primaryCategory.name}
            </AppText>
          </View>
        ) : null}
        <AppText variant="bodyStrong" color={colors.brand} numberOfLines={1}>
          {place.name}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {subtitle}
        </AppText>
        {place.ratingCount > 0 ? (
          <View style={styles.rating}>
            <Icon name="star" size={13} color="#f5a524" />
            <AppText variant="smallStrong" color={colors.ink}>
              {place.ratingAverage.toFixed(1)}
            </AppText>
            <AppText variant="small">
              ({place.ratingCount} {place.ratingCount === 1 ? 'review' : 'reviews'})
            </AppText>
          </View>
        ) : (
          <AppText variant="small" color={colors.muted}>
            No reviews yet
          </AppText>
        )}
      </View>

      <View style={styles.side}>
        <View style={styles.sideTop}>
          <View style={styles.distance}>
            <Icon name="location-outline" size={14} color={colors.accent} />
            <AppText variant="caption" color={colors.body} numberOfLines={1}>
              {distance ?? place.city}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
            accessibilityState={{ selected: saved }}
            hitSlop={10}
            onPress={onToggleSave}
          >
            <Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={21} color={colors.brand} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View details of ${place.name}`}
          onPress={open}
          style={({ pressed }) => [
            styles.details,
            pressed && { backgroundColor: colors.goPressed },
          ]}
        >
          <AppText variant="smallStrong" color={colors.surface}>
            View Details
          </AppText>
          <Icon name="arrow-forward" size={14} color={colors.surface} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  imageWrap: { width: 104, height: 104, borderRadius: radius.md, overflow: 'hidden' },
  image: { width: '100%', height: '100%', backgroundColor: colors.subtle },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  verified: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.go,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3, justifyContent: 'center', paddingVertical: 2 },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  side: { alignItems: 'flex-end', justifyContent: 'space-between', paddingVertical: 2 },
  sideTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: 80 },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.go,
  },
});
