import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stars } from '@/components/stars';
import { AppText, Badge, Card, EmptyState, ErrorState, ListSkeleton, TabHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { businessService } from '@/services/business.service';
import { colors, space } from '@/theme/tokens';

const PAGE_SIZE = 20;

/** What students say about my places. */
export default function BusinessReviews() {
  const query = useInfiniteQuery({
    queryKey: ['business', 'reviews'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => businessService.reviews({ page: pageParam }, signal).then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const items = query.data?.pages.flat() ?? [];

  return (
    <View style={styles.root}>
      <TabHeader title="Reviews" subtitle="What students say about your places" />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.action} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ margin: space.lg }} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="star-outline"
              title="No reviews yet"
              message="Put your review QR code on the counter: students scan it and rate you in seconds."
              actionLabel="Go to my listings"
              onAction={() => router.navigate('/dashboard')}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.head}>
                <AppText variant="bodyStrong" style={styles.flex}>
                  {item.authorName}
                </AppText>
                <AppText variant="caption">{formatDate(item.createdAt)}</AppText>
              </View>
              <Badge label={item.place.name} tint="blue" icon="storefront" />
              <Stars value={item.rating} size={16} />
              {item.comment ? <AppText color={colors.ink}>{item.comment}</AppText> : null}
              {item.dimensionRatings.length > 0 ? (
                <View style={styles.dims}>
                  {item.dimensionRatings.map((dimension) => (
                    <Badge key={dimension.dimensionId} label={`${dimension.label} ${dimension.rating}★`} tint="slate" />
                  ))}
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  list: { padding: space.lg, paddingTop: space.sm, gap: space.md },
  card: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center' },
  dims: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
