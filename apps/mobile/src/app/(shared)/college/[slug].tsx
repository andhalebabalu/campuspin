import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BackButton,
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingView,
} from '@/components/ui';
import { formatDistance, iconFor } from '@/features/places/meta';
import { PlaceCard } from '@/features/places/place-card';
import { isApiError } from '@/lib/errors';
import { mediaUrl } from '@/lib/media';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';
import { colors, heroGradient, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 20;

/** A college and everything around it, nearest first. */
export default function CollegeScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const college = useQuery({
    queryKey: ['college', slug],
    queryFn: ({ signal }) => collegesService.getBySlug(slug, signal).then((r) => r.data),
  });
  const nearby = useQuery({
    queryKey: ['college', slug, 'nearby'],
    queryFn: ({ signal }) => collegesService.nearby(slug, signal).then((r) => r.data.categories),
  });
  const places = useInfiniteQuery({
    queryKey: ['places', { collegeSlug: slug, categorySlug, sort: 'nearest' }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      placesService
        .list({ collegeSlug: slug, categorySlug: categorySlug ?? undefined, sort: 'nearest', page: pageParam, limit: PAGE_SIZE }, signal)
        .then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });

  const back = (
    <View style={[styles.floating, { top: insets.top + space.xs }]}>
      <BackButton tone="glass" />
    </View>
  );

  if (college.isPending) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingView />
        {back}
      </View>
    );
  }
  if (college.isError || !college.data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 60 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {isApiError(college.error, 404) ? (
          <EmptyState icon="school-outline" title="College not found" />
        ) : (
          <ErrorState error={college.error} onRetry={() => void college.refetch()} />
        )}
        <View style={[styles.floating, { top: insets.top + space.xs }]}>
          <BackButton />
        </View>
      </View>
    );
  }

  const data = college.data;
  const cover = mediaUrl(data.coverImageUrl ?? data.images[0]?.imageUrl);
  const logo = mediaUrl(data.logoUrl);
  const items = places.data?.pages.flat() ?? [];

  const header = (
    <View>
      <View style={styles.hero}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={heroGradient} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={['rgba(4,35,73,0.2)', 'rgba(4,35,73,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={[styles.heroBody, { paddingTop: insets.top + 64 }]}>
          <View style={styles.logo}>
            {logo ? <Image source={{ uri: logo }} style={styles.logoImage} contentFit="contain" /> : <Icon name="school" size={26} color={colors.action} />}
          </View>
          <AppText variant="title" color={colors.surface}>
            {data.name}
          </AppText>
          <View style={styles.badges}>
            {data.verified ? <Badge label="Verified" tint="green" icon="checkmark-circle" /> : null}
            <Badge label={`${data.placeCount} places nearby`} tint="blue" icon="location" />
          </View>
          <AppText variant="small" color="rgba(255,255,255,0.85)">
            {data.address}
          </AppText>
        </View>
      </View>

      <View style={styles.body}>
        {data.description ? <AppText numberOfLines={5}>{data.description}</AppText> : null}
        {data.website ? (
          <Button
            title="College website"
            variant="outline"
            size="sm"
            icon="globe-outline"
            fullWidth={false}
            onPress={() => void Linking.openURL(data.website!)}
          />
        ) : null}

        <AppText variant="heading">Around the campus</AppText>
        {nearby.data && nearby.data.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" icon="apps" selected={categorySlug === null} onPress={() => setCategorySlug(null)} />
            {nearby.data.map((category) => (
              <Chip
                key={category.slug}
                label={`${category.name} · ${category.count}`}
                icon={iconFor(category.icon, 'pricetag')}
                selected={categorySlug === category.slug}
                onPress={() => setCategorySlug(category.slug)}
              />
            ))}
          </ScrollView>
        ) : null}
        {categorySlug && nearby.data ? (
          <AppText variant="small">
            Nearest: {nearby.data.find((c) => c.slug === categorySlug)?.nearest.name} ·{' '}
            {formatDistance(nearby.data.find((c) => c.slug === categorySlug)?.nearestMeters ?? null)}
          </AppText>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item }) => (
          <View style={styles.padded}>
            <PlaceCard place={item} />
          </View>
        )}
        onEndReached={() => {
          if (places.hasNextPage && !places.isFetchingNextPage) void places.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          places.isPending ? (
            <ActivityIndicator color={colors.action} style={{ margin: space.xl }} />
          ) : (
            <EmptyState icon="location-outline" title="No places listed yet" />
          )
        }
        ListFooterComponent={places.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ margin: space.lg }} /> : null}
      />
      {back}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  floating: { position: 'absolute', left: space.lg },
  hero: { minHeight: 280, justifyContent: 'flex-end', overflow: 'hidden' },
  heroBody: { padding: space.lg, gap: space.sm },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: 44, height: 44 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  body: { padding: space.lg, gap: space.md },
  chips: { gap: space.sm },
  padded: { paddingHorizontal: space.lg },
});
