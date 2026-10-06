import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { EmptyState, ErrorState, Icon, ListSkeleton } from '@/components/ui';
import { CollegeCardView } from '@/features/places/place-card';
import { collegesService } from '@/services/colleges.service';
import { colors, fonts, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 20;

/** Every college, most popular first, with search. */
export default function Colleges() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ['colleges', 'all', q],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      collegesService
        .list(
          { q: q || undefined, sort: q ? undefined : 'popular', page: pageParam, limit: PAGE_SIZE },
          signal,
        )
        .then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const items = query.data?.pages.flat() ?? [];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Colleges' }} />
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="College name or city"
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
      {query.isPending ? (
        <ListSkeleton count={3} height={180} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <CollegeCardView college={item} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon="school-outline"
              title="No college matches"
              message="Try another name or city."
            />
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator color={colors.go} style={styles.loading} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  search: {
    height: 48,
    margin: space.lg,
    marginTop: space.sm,
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
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md },
  loading: { margin: space.lg },
});
