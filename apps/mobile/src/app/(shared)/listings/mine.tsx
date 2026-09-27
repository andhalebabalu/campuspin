import type { ListingStatus } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Button, ChipRow, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { ListingRow } from '@/features/marketplace/listing-card';
import { QuotaBanner, useListingQuota } from '@/features/marketplace/listing-quota';
import { marketplaceService } from '@/services/marketplace.service';
import { colors, space } from '@/theme/tokens';

type Filter = ListingStatus | 'ALL';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default function MyListings() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const quota = useListingQuota();
  const query = useQuery({
    queryKey: ['marketplace', 'mine', filter],
    queryFn: ({ signal }) =>
      marketplaceService.mine({ status: filter === 'ALL' ? undefined : filter }, signal).then((r) => r.data),
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'My listings' }} />
      <View style={styles.filters}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={query.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ListingRow listing={item} />}
          ListHeaderComponent={<QuotaBanner quota={quota.data} />}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.action} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="pricetags-outline"
              title="No listings here"
              message="Things you sell show up here."
              actionLabel="Sell something"
              onAction={() => router.push('/listing/new')}
            />
          }
          ListFooterComponent={
            query.data.length > 0 ? (
              <Button title="Sell something else" variant="secondary" icon="add" onPress={() => router.push('/listing/new')} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  filters: { paddingBottom: space.sm },
  list: { padding: space.lg, gap: space.md },
});
