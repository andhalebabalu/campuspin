import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  type ListingCategory,
  type MarketplaceScope,
  type MarketplaceSort,
} from '@platform/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  AppText,
  ChipRow,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListSkeleton,
  Segmented,
  Sheet,
  SheetOption,
  TabHeader,
} from '@/components/ui';
import { VerifyGate } from '@/components/verify-gate';
import { CATEGORY_ICONS, ListingTile } from '@/features/marketplace/listing-card';
import { useUnreadMessages } from '@/hooks/use-unread';
import { useUser } from '@/lib/session';
import { marketplaceService } from '@/services/marketplace.service';
import { brandGradient, colors, fonts, radius, shadows, space } from '@/theme/tokens';

const PAGE_SIZE = 20;

const SCOPES: { value: MarketplaceScope; label: string }[] = [
  { value: 'my_college', label: 'My college' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'city', label: 'City' },
];

const SORTS: { value: MarketplaceSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

type CategoryFilter = ListingCategory | 'ALL';
const CATEGORY_OPTIONS = [
  { value: 'ALL' as const, label: 'All', icon: 'apps' as const },
  ...LISTING_CATEGORIES.map((category) => ({
    value: category,
    label: LISTING_CATEGORY_LABELS[category],
    icon: CATEGORY_ICONS[category],
  })),
];

export default function Market() {
  const user = useUser();
  const unread = useUnreadMessages(user.student.verified);
  const header = (
    <TabHeader
      title="Marketplace"
      subtitle="Buy and sell with students near you"
      right={
        user.student.verified ? (
          <>
            <IconButton icon="albums-outline" label="My listings" onPress={() => router.push('/listings/mine')} />
            <IconButton
              icon="chatbubble-ellipses-outline"
              label="Messages"
              badge={unread}
              onPress={() => router.push('/messages')}
            />
          </>
        ) : undefined
      }
    />
  );
  if (!user.student.verified) {
    return (
      <View style={styles.root}>
        {header}
        <VerifyGate
          icon="pricetags"
          title="The student marketplace"
          message="Buy and sell books, notes, cycles and hostel gear with verified students near your college."
        />
      </View>
    );
  }
  return (
    <View style={styles.root}>
      {header}
      <Browse />
    </View>
  );
}

function Browse() {
  const { width } = useWindowDimensions();
  const tileWidth = (width - space.lg * 2 - space.md) / 2;
  const [scope, setScope] = useState<MarketplaceScope>('nearby');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [sort, setSort] = useState<MarketplaceSort>('newest');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sortOpen, setSortOpen] = useState(false);

  // Search as the user types, but not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ['marketplace', 'browse', { scope, category, sort, q }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      marketplaceService
        .browse(
          { page: pageParam, scope, sort, q: q || undefined, category: category === 'ALL' ? undefined : category },
          signal,
        )
        .then((result) => result.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const listings = query.data?.pages.flat() ?? [];

  const filters = (
    <View style={styles.filters}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search books, cycles, notes…"
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
        <IconButton icon="swap-vertical" label="Sort" onPress={() => setSortOpen(true)} />
      </View>
      <View style={styles.padded}>
        <Segmented options={SCOPES} value={scope} onChange={setScope} />
      </View>
      <ChipRow options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
    </View>
  );

  return (
    <>
      {query.isPending ? (
        <>
          {filters}
          <ListSkeleton count={3} height={120} />
        </>
      ) : query.isError ? (
        <>
          {filters}
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={filters}
          renderItem={({ item }) => <ListingTile listing={item} width={tileWidth} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor={colors.action}
              colors={[colors.action]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="pricetags-outline"
              title={q ? 'Nothing matches' : 'Nothing here yet'}
              message={q ? 'Try other words or a wider area.' : 'Be the first to sell something to students nearby.'}
              actionLabel="Sell something"
              onAction={() => router.push('/listing/new')}
            />
          }
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ margin: space.lg }} /> : null
          }
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sell something"
        onPress={() => router.push('/listing/new')}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
          <Icon name="add" size={22} color={colors.surface} />
          <AppText variant="bodyStrong" color={colors.surface}>
            Sell
          </AppText>
        </LinearGradient>
      </Pressable>

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        {SORTS.map((option) => (
          <SheetOption
            key={option.value}
            label={option.label}
            selected={sort === option.value}
            onPress={() => {
              setSort(option.value);
              setSortOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  filters: { gap: space.md, paddingBottom: space.md },
  padded: { paddingHorizontal: space.lg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  search: {
    flex: 1,
    height: 46,
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
  grid: { paddingBottom: 110 },
  column: { gap: space.md, paddingHorizontal: space.lg, marginBottom: space.md },
  fab: { position: 'absolute', right: space.lg, bottom: space.lg, borderRadius: radius.pill, ...shadows.lg },
  fabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
  },
});
