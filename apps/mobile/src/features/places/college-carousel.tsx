import type { CollegeCard } from '@platform/contracts';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Icon } from '@/components/ui';
import { mediaUrl } from '@/lib/media';
import { colors, radius, shadows, space } from '@/theme/tokens';

const GAP = space.md;

/**
 * Colleges as a swipeable gallery: one card per swipe (the next one peeks in), with page dots.
 * The first card of the popular list carries a "Most Popular" tag.
 */
export function CollegeCarousel({
  colleges,
  popularFirst = false,
}: {
  colleges: CollegeCard[];
  popularFirst?: boolean;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(300, width * 0.68);
  const [page, setPage] = useState(0);

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={colleges}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={styles.row}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + GAP));
          if (next !== page) void Haptics.selectionAsync().catch(() => undefined);
          setPage(next);
        }}
        renderItem={({ item, index }) => (
          <CollegeSlide college={item} width={cardWidth} popular={popularFirst && index === 0} />
        )}
      />
      {colleges.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`College ${page + 1} of ${colleges.length}`}>
          {colleges.map((college, index) => (
            <View key={college.id} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CollegeSlide({
  college,
  width,
  popular,
}: {
  college: CollegeCard;
  width: number;
  popular: boolean;
}) {
  const cover = mediaUrl(college.coverImageUrl);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={college.name}
      onPress={() => router.push({ pathname: '/college/[slug]', params: { slug: college.slug } })}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={styles.coverWrap}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Icon name="school" size={34} color={colors.primaryBorder} />
          </View>
        )}
        {popular ? (
          <View style={styles.popular}>
            <Icon name="add" size={12} color={colors.surface} />
            <AppText variant="caption" color={colors.surface}>
              Most Popular
            </AppText>
          </View>
        ) : null}
        {college.verified ? (
          <View style={styles.verified}>
            <Icon name="checkmark-circle" size={20} color={colors.go} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" color={colors.brand} numberOfLines={2} style={styles.name}>
          {college.name}
        </AppText>
        <View style={styles.meta}>
          <Icon name="location-outline" size={14} color={colors.muted} />
          <AppText variant="small" numberOfLines={1} style={styles.flex}>
            {college.city} · {college.placeCount} places
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
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  pressed: { opacity: 0.94 },
  coverWrap: { height: 120 },
  cover: { width: '100%', height: '100%' },
  coverPlaceholder: {
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popular: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.go,
  },
  verified: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: space.md, gap: space.xs },
  name: { minHeight: 44 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flex: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lineStrong },
  dotActive: { width: 18, backgroundColor: colors.go },
});
