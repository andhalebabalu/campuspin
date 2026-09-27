import type { CollegeCard, PlaceCard as PlaceCardData } from '@platform/contracts';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Icon } from '@/components/ui';
import { mediaUrl } from '@/lib/media';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { categoryPhoto, formatDistance, formatPlacePrice, iconFor } from './meta';

export function Rating({ average, count }: { average: number; count: number }) {
  if (count === 0) {
    return (
      <AppText variant="caption" color={colors.muted}>
        No reviews yet
      </AppText>
    );
  }
  return (
    <View style={styles.rating}>
      <Icon name="star" size={13} color="#f59e0b" />
      <AppText variant="smallStrong" color={colors.ink}>
        {average.toFixed(1)}
      </AppText>
      <AppText variant="caption">({count})</AppText>
    </View>
  );
}

/** A place as a horizontal card: photo, name, category, rating, price and distance. */
export function PlaceCard({ place }: { place: PlaceCardData }) {
  const photo = mediaUrl(place.coverImageUrl);
  const stock = photo ? undefined : categoryPhoto(place.primaryCategory?.slug);
  const distance = formatDistance(place.distanceMeters);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: place.slug } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.imageWrap}>
        {photo || stock ? (
          <Image source={photo ? { uri: photo } : stock} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Icon name={iconFor(place.primaryCategory?.icon)} size={28} color={colors.placeholder} />
          </View>
        )}
        {place.verified ? (
          <View style={styles.verified}>
            <Icon name="checkmark-circle" size={14} color={colors.surface} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {place.name}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {[place.primaryCategory?.name, distance ?? place.city].filter(Boolean).join(' · ')}
        </AppText>
        <Rating average={place.ratingAverage} count={place.ratingCount} />
        <AppText variant="smallStrong" color={colors.action} numberOfLines={1}>
          {formatPlacePrice(place.priceMin, place.priceMax, place.priceUnit)}
        </AppText>
      </View>
    </Pressable>
  );
}

/** A college as a card with its cover photo. */
export function CollegeCardView({ college, width }: { college: CollegeCard; width?: number }) {
  const cover = mediaUrl(college.coverImageUrl);
  const logo = mediaUrl(college.logoUrl);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/college/[slug]', params: { slug: college.slug } })}
      style={({ pressed }) => [styles.college, width ? { width } : null, pressed && styles.pressed]}
    >
      {cover ? (
        <Image source={{ uri: cover }} style={styles.collegeCover} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.collegeCover, styles.collegePlaceholder]}>
          <Icon name="school" size={30} color={colors.primaryBorder} />
        </View>
      )}
      <View style={styles.collegeBody}>
        <View style={styles.collegeLogo}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImage} contentFit="contain" />
          ) : (
            <Icon name="school" size={18} color={colors.action} />
          )}
        </View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
              {college.shortName ?? college.name}
            </AppText>
            {college.verified ? <Icon name="checkmark-circle" size={16} color={colors.action} /> : null}
          </View>
          <AppText variant="small" numberOfLines={1}>
            {college.city} · {college.placeCount} places nearby
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  imageWrap: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden' },
  image: { width: '100%', height: '100%', backgroundColor: colors.subtle },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  verified: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3, justifyContent: 'center' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  college: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  collegeCover: { width: '100%', height: 110 },
  collegePlaceholder: { backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  collegeBody: { flexDirection: 'row', gap: space.sm, padding: space.md, alignItems: 'center' },
  collegeLogo: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: 30, height: 30 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
