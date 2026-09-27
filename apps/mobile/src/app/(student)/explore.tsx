import type { PLACE_SORTS } from '@platform/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  ListSkeleton,
  SectionHeader,
  TabHeader,
} from '@/components/ui';
import { iconFor } from '@/features/places/meta';
import { CollegeCardView, PlaceCard } from '@/features/places/place-card';
import { useUser } from '@/lib/session';
import { categoriesService } from '@/services/categories.service';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';
import { colors, fonts, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 20;

/** Places around campus and colleges: search, filter by category, near my college first. */
export default function Explore() {
  const user = useUser();
  const college = user.student.college ?? user.college;
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [nearMe, setNearMe] = useState(Boolean(college));

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesService.list(signal).then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const chips = useMemo(
    () => (categories.data ?? []).flatMap((group) => (group.children.length > 0 ? group.children : [group])).slice(0, 16),
    [categories.data],
  );

  const colleges = useQuery({
    queryKey: ['colleges', 'popular'],
    queryFn: ({ signal }) => collegesService.list({ sort: 'popular', limit: 10 }, signal).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const collegeSlug = nearMe && college ? college.slug : undefined;
  const sort: (typeof PLACE_SORTS)[number] = q ? 'relevance' : collegeSlug ? 'nearest' : 'rating';
  const places = useInfiniteQuery({
    queryKey: ['places', { q, categorySlug, collegeSlug, sort }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      placesService
        .list(
          { q: q || undefined, categorySlug: categorySlug ?? undefined, collegeSlug, sort, page: pageParam, limit: PAGE_SIZE },
          signal,
        )
        .then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const items = places.data?.pages.flat() ?? [];
  const browsing = !q && !categorySlug;

  const header = (
    <View style={styles.header}>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Mess, PG, library, xerox…"
          placeholderTextColor={colors.placeholder}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {college ? (
          <Chip
            label={`Near ${college.name.split(' ').slice(0, 3).join(' ')}`}
            icon="navigate"
            selected={nearMe}
            onPress={() => setNearMe((value) => !value)}
          />
        ) : null}
        {chips.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            icon={iconFor(category.icon, 'pricetag')}
            selected={categorySlug === category.slug}
            onPress={() => setCategorySlug((current) => (current === category.slug ? null : category.slug))}
          />
        ))}
      </ScrollView>

      {browsing && colleges.data && colleges.data.length > 0 ? (
        <View>
          <View style={styles.padded}>
            <SectionHeader title="Colleges" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colleges}>
            {colleges.data.map((item) => (
              <CollegeCardView key={item.id} college={item} width={230} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.padded}>
        <SectionHeader
          title={q ? `Results for “${q}”` : collegeSlug ? `Near ${college?.name ?? 'your college'}` : 'Top rated places'}
          actionLabel="Suggest a place"
          onAction={() => router.push('/suggest-place')}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <TabHeader title="Explore" subtitle="Places around campus, rated by students" />
      {places.isError ? (
        <>
          {header}
          <ErrorState error={places.error} onRetry={() => void places.refetch()} />
        </>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
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
          refreshControl={
            <RefreshControl
              refreshing={places.isRefetching && !places.isFetchingNextPage}
              onRefresh={() => void places.refetch()}
              tintColor={colors.action}
              colors={[colors.action]}
            />
          }
          ListEmptyComponent={
            places.isPending ? (
              <ListSkeleton count={3} height={120} />
            ) : (
              <EmptyState
                icon="location-outline"
                title="No places found"
                message="Try another search or category, or suggest a place we are missing."
                actionLabel="Suggest a place"
                onAction={() => router.push('/suggest-place')}
              />
            )
          }
          ListFooterComponent={
            places.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ margin: space.lg }} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { gap: space.lg, paddingBottom: space.xs },
  padded: { paddingHorizontal: space.lg },
  search: {
    height: 48,
    marginHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  chips: { gap: space.sm, paddingHorizontal: space.lg },
  colleges: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xs },
  list: { paddingBottom: space.xxxl },
});
