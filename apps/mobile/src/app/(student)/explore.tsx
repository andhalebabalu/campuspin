import type { PLACE_SORTS } from '@platform/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListSkeleton,
  Sheet,
  SheetOption,
  type IconName,
} from '@/components/ui';
import { CollegeCarousel } from '@/features/places/college-carousel';
import { ExplorePlaceCard } from '@/features/places/explore-place-card';
import { categoryPhoto, iconFor } from '@/features/places/meta';
import { PlaceCarousel } from '@/features/places/place-carousel';
import { useSavedPlaces } from '@/hooks/use-saved-places';
import { useUnreadNotifications } from '@/hooks/use-unread';
import { useUser } from '@/lib/session';
import { categoriesService } from '@/services/categories.service';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';
import { colors, fonts, radius, shadows, space } from '@/theme/tokens';

const PAGE_SIZE = 20;
type Sort = (typeof PLACE_SORTS)[number];

const SORTS: { value: Sort; label: string; icon: IconName; needsCollege?: boolean }[] = [
  {
    value: 'nearest',
    label: 'Nearest to my college',
    icon: 'navigate-outline',
    needsCollege: true,
  },
  { value: 'rating', label: 'Top rated', icon: 'star-outline' },
  { value: 'cheapest', label: 'Lowest price', icon: 'pricetag-outline' },
  { value: 'newest', label: 'Newest', icon: 'sparkles-outline' },
];

/** Places around campus and colleges: search, filter by category, near my college first. */
export default function Explore() {
  const user = useUser();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();
  const saved = useSavedPlaces();
  const college = user.student.college ?? user.college;
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [nearMe, setNearMe] = useState(Boolean(college));
  const [sortChoice, setSortChoice] = useState<Sort | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sheet, setSheet] = useState<'location' | 'filters' | null>(null);

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
    () =>
      (categories.data ?? [])
        .flatMap((group) => (group.children.length > 0 ? group.children : [group]))
        .slice(0, 16),
    [categories.data],
  );

  const colleges = useQuery({
    queryKey: ['colleges', 'popular'],
    queryFn: ({ signal }) =>
      collegesService.list({ sort: 'popular', limit: 10 }, signal).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const collegeSlug = nearMe && college ? college.slug : undefined;
  // "Nearest" needs a college to measure from; a search ranks by relevance unless a sort is chosen.
  const sort: Sort =
    sortChoice && (sortChoice !== 'nearest' || collegeSlug)
      ? sortChoice
      : q
        ? 'relevance'
        : collegeSlug
          ? 'nearest'
          : 'rating';

  const topRated = useQuery({
    queryKey: ['places', 'top', collegeSlug ?? null],
    queryFn: ({ signal }) =>
      placesService
        .list({ collegeSlug, sort: 'rating', minRating: 3.5, limit: 6 }, signal)
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const places = useInfiniteQuery({
    queryKey: ['places', { q, categorySlug, collegeSlug, sort, verifiedOnly }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      placesService
        .list(
          {
            q: q || undefined,
            categorySlug: categorySlug ?? undefined,
            collegeSlug,
            sort,
            ...(verifiedOnly ? { verified: true as const } : {}),
            page: pageParam,
            limit: PAGE_SIZE,
          },
          signal,
        )
        .then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const items = places.data?.pages.flat() ?? [];
  const browsing = !q && !categorySlug;
  const selectedCategory = chips.find((chip) => chip.slug === categorySlug);
  const filtersOn = verifiedOnly || sortChoice !== null;

  function openMap() {
    const what = selectedCategory?.name ?? 'mess, PG, hostel';
    const where = nearMe && college ? college.name : 'Ahilyanagar';
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${what} near ${where}`)}`,
    );
  }

  const header = (
    <View style={styles.header}>
      {/* Brand bar: logo, where we are looking, notifications, profile. */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Image
          source={require('@/assets/images/logo-full.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="CampusPin: Discover. Connect. Experience."
        />
        <View style={styles.topActions}>
          {college ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                nearMe ? `Showing places near ${college.name}. Change` : 'Showing all areas. Change'
              }
              onPress={() => setSheet('location')}
              style={({ pressed }) => [styles.location, pressed && styles.pressed]}
            >
              <Icon name="location" size={15} color={colors.pin} />
              <AppText
                variant="smallStrong"
                color={colors.ink}
                numberOfLines={1}
                style={styles.shrink}
              >
                {nearMe ? college.name.split(' ').slice(0, 2).join(' ') : 'All areas'}
              </AppText>
              <Icon name="chevron-down" size={14} color={colors.muted} />
            </Pressable>
          ) : null}
          <IconButton
            icon="notifications-outline"
            label="Notifications"
            badge={unread}
            onPress={() => router.push('/notifications')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={() => router.navigate('/me')}
          >
            <Avatar name={user.name} imageUrl={user.avatarUrl} size={40} verified={user.student.verified} />
          </Pressable>
        </View>
      </View>

      {/* Hero banner, with the search bar overlapping its bottom edge. */}
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={['#e6f5ea', '#f3faf5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroImageWrap} pointerEvents="none">
            <Image source={categoryPhoto('hostels')} style={styles.heroImage} contentFit="cover" />
            <LinearGradient
              colors={['#e9f6ec', 'rgba(233,246,236,0.55)', 'rgba(233,246,236,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <View style={styles.heroBadge}>
            <AppText variant="caption" color={colors.brand}>
              Your Campus,{'\n'}Your Community
            </AppText>
            <Icon name="location" size={18} color={colors.brand} />
          </View>
          <View style={styles.heroText}>
            <AppText variant="smallStrong" color={colors.accent}>
              Find Everything Near Your College
            </AppText>
            <AppText variant="hero" color={colors.brand}>
              Explore Places
            </AppText>
            <AppText variant="bodyStrong" color={colors.ink}>
              Around campus, rated by students
            </AppText>
          </View>
        </LinearGradient>

        <View style={styles.search}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search places, mess, rooms, shops, etc…"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Icon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sort and filter"
            onPress={() => setSheet('filters')}
            style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
          >
            <Icon name="options-outline" size={20} color={colors.brand} />
            {filtersOn ? <View style={styles.filterDot} /> : null}
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip
          label="All"
          icon="grid"
          selected={categorySlug === null}
          onPress={() => setCategorySlug(null)}
        />
        {chips.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            icon={iconFor(category.icon, 'pricetag')}
            selected={categorySlug === category.slug}
            onPress={() =>
              setCategorySlug((current) => (current === category.slug ? null : category.slug))
            }
          />
        ))}
      </ScrollView>

      {browsing && colleges.data && colleges.data.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle
            icon="business"
            title="Colleges"
            action="View all"
            onAction={() => router.push('/colleges')}
          />
          <CollegeCarousel colleges={colleges.data} popularFirst />
        </View>
      ) : null}

      {browsing && topRated.data && topRated.data.length > 1 ? (
        <View style={styles.section}>
          <SectionTitle icon="star" title="Top rated around you" />
          <PlaceCarousel places={topRated.data} />
        </View>
      ) : null}

      <View style={styles.nearStrip}>
        <View style={styles.nearIcon}>
          <Icon name="location" size={22} color={colors.go} />
        </View>
        <View style={styles.flex}>
          <AppText variant="subheading" color={colors.brand} numberOfLines={1}>
            {q
              ? `Results for “${q}”`
              : selectedCategory
                ? selectedCategory.name
                : collegeSlug
                  ? 'Near your college'
                  : 'Top rated places'}
          </AppText>
          <AppText variant="small" numberOfLines={1}>
            {collegeSlug ? `Top rated places near ${college?.name ?? 'you'}` : 'Across all areas'}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open in maps"
          onPress={openMap}
          style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}
        >
          <Icon name="map" size={16} color={colors.go} />
          <AppText variant="smallStrong" color={colors.go}>
            Use Map
          </AppText>
          <Icon name="chevron-forward" size={14} color={colors.go} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {places.isError ? (
        <ScrollView>
          {header}
          <ErrorState error={places.error} onRetry={() => void places.refetch()} />
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.padded}>
              <ExplorePlaceCard
                place={item}
                saved={saved.isSaved(item.id)}
                onToggleSave={() => saved.toggle(item.id)}
              />
            </View>
          )}
          onEndReached={() => {
            if (places.hasNextPage && !places.isFetchingNextPage) void places.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={places.isRefetching && !places.isFetchingNextPage}
              onRefresh={() => {
                void places.refetch();
                void colleges.refetch();
                void topRated.refetch();
              }}
              tintColor={colors.go}
              colors={[colors.go]}
            />
          }
          ListEmptyComponent={
            places.isPending ? (
              <ListSkeleton count={3} height={124} />
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
            places.isFetchingNextPage ? (
              <ActivityIndicator color={colors.go} style={styles.loadingMore} />
            ) : items.length > 0 ? (
              <Pressable onPress={() => router.push('/suggest-place')} style={styles.suggest}>
                <Icon name="add-circle-outline" size={18} color={colors.action} />
                <AppText variant="smallStrong" color={colors.action}>
                  Know a place we are missing? Suggest it
                </AppText>
              </Pressable>
            ) : null
          }
        />
      )}

      <Sheet visible={sheet === 'location'} onClose={() => setSheet(null)} title="Show places">
        {college ? (
          <SheetOption
            icon="school-outline"
            label={`Near ${college.name}`}
            selected={nearMe}
            onPress={() => {
              setNearMe(true);
              setSheet(null);
            }}
          />
        ) : null}
        <SheetOption
          icon="globe-outline"
          label="All areas"
          selected={!nearMe}
          onPress={() => {
            setNearMe(false);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'filters'} onClose={() => setSheet(null)} title="Sort and filter">
        {SORTS.filter((option) => !option.needsCollege || collegeSlug).map((option) => (
          <SheetOption
            key={option.value}
            icon={option.icon}
            label={option.label}
            selected={sort === option.value}
            onPress={() => {
              setSortChoice(option.value);
              setSheet(null);
            }}
          />
        ))}
        <View style={styles.switchRow}>
          <Icon name="shield-checkmark-outline" size={21} color={colors.ink} />
          <AppText variant="bodyStrong" style={styles.flex}>
            Verified places only
          </AppText>
          <Switch
            value={verifiedOnly}
            onValueChange={setVerifiedOnly}
            trackColor={{ true: colors.go, false: colors.lineStrong }}
            thumbColor={colors.surface}
          />
        </View>
        {filtersOn ? (
          <SheetOption
            icon="refresh"
            label="Reset"
            onPress={() => {
              setSortChoice(null);
              setVerifiedOnly(false);
              setSheet(null);
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

function SectionTitle({
  icon,
  title,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Icon name={icon} size={22} color={colors.brand} />
      <AppText variant="heading" color={colors.brand} style={styles.flex}>
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable
          hitSlop={8}
          onPress={onAction}
          accessibilityRole="button"
          style={styles.sectionAction}
        >
          <AppText variant="smallStrong" color={colors.go}>
            {action}
          </AppText>
          <Icon name="arrow-forward" size={14} color={colors.go} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
  header: { gap: space.lg, paddingBottom: space.md },
  padded: { paddingHorizontal: space.lg },
  list: { paddingBottom: space.xxxl },
  separator: { height: space.md },
  loadingMore: { margin: space.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  logo: { flex: 1, height: 44, maxWidth: 150 },
  topActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 38,
    maxWidth: 140,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.sm,
  },
  heroWrap: { paddingHorizontal: space.lg },
  hero: {
    height: 172,
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  heroImageWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '58%' },
  heroImage: { width: '100%', height: '100%', opacity: 0.75 },
  heroBadge: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  heroText: { gap: 2, maxWidth: '72%' },
  search: {
    height: 58,
    marginTop: -29,
    marginHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: 6,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.md,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pin,
  },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  section: { gap: space.md },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nearStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  nearIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 38,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: space.xl,
  },
});
