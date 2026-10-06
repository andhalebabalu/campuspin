import type { PlaceCard } from '@platform/contracts';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Icon } from '@/components/ui';
import { mediaUrl } from '@/lib/media';
import { colors, radius, shadows, space } from '@/theme/tokens';
import { categoryPhoto, formatDistance, iconFor } from './meta';

const GAP = space.md;

/** Big photo cards of places, swiped one at a time like a gallery, with page dots. */
export function PlaceCarousel({ places }: { places: PlaceCard[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - space.lg * 2 - 36;
  const [page, setPage] = useState(0);

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={places}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={styles.row}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + GAP));
          if (next !== page) void Haptics.selectionAsync().catch(() => undefined);
          setPage(next);
        }}
        renderItem={({ item }) => <PlaceSlide place={item} width={cardWidth} />}
      />
      {places.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`Place ${page + 1} of ${places.length}`}>
          {places.map((place, index) => (
            <View key={place.id} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PlaceSlide({ place, width }: { place: PlaceCard; width: number }) {
  const photo = mediaUrl(place.coverImageUrl);
  const stock = photo ? undefined : categoryPhoto(place.primaryCategory?.slug);
  const distance = formatDistance(place.distanceMeters);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: place.slug } })}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      {photo || stock ? (
        <Image
          source={photo ? { uri: photo } : stock}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon
            name={iconFor(place.primaryCategory?.icon)}
            size={48}
            color={colors.primaryBorder}
          />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(10,37,73,0.88)']}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.top}>
        {place.primaryCategory ? (
          <View style={styles.tag}>
            <AppText variant="caption" color={colors.surface}>
              {place.primaryCategory.name}
            </AppText>
          </View>
        ) : (
          <View />
        )}
        {place.ratingCount > 0 ? (
          <View style={styles.rating}>
            <Icon name="star" size={12} color="#f5a524" />
            <AppText variant="caption" color={colors.ink}>
              {place.ratingAverage.toFixed(1)}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.bottom}>
        <AppText variant="heading" color={colors.surface} numberOfLines={1}>
          {place.name}
        </AppText>
        <View style={styles.meta}>
          <Icon name="location" size={13} color={colors.surface} />
          <AppText variant="small" color="rgba(255,255,255,0.9)" numberOfLines={1}>
            {distance ? `${distance} away` : place.city}
            {place.verified ? ' · Verified' : ''}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { gap: GAP, paddingHorizontal: space.lg, paddingVertical: space.xs },
  card: {
    height: 190,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.subtle,
    justifyContent: 'space-between',
    ...shadows.md,
  },
  pressed: { opacity: 0.94 },
  placeholder: {
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', padding: space.md },
  tag: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.go,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  bottom: { padding: space.md, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lineStrong },
  dotActive: { width: 18, backgroundColor: colors.go },
});
