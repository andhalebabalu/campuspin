import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { OfferCard } from '@/features/offers/offer-card';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { engagementService } from '@/services/engagement.service';
import { colors, space } from '@/theme/tokens';

/** Student offers usable today, nearest first once the location is known. */
export default function OffersScreen() {
  const location = useDeviceLocation();
  const offers = useQuery({
    queryKey: ['offers', 'nearby', location.point],
    enabled: location.ready,
    queryFn: ({ signal }) => engagementService.nearbyOffers(location.point ?? {}, signal).then((r) => r.data),
  });
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Student offers' }} />
      <FlatList
        data={offers.data ?? []}
        keyExtractor={(offer) => offer.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <OfferCard offer={item} />}
        refreshing={offers.isRefetching}
        onRefresh={() => void offers.refetch()}
        ListHeaderComponent={
          !location.point ? (
            <Button title="Show nearest first" icon="navigate-outline" variant="outline" size="sm" onPress={() => void location.request()} />
          ) : null
        }
        ListEmptyComponent={
          offers.isPending || !location.ready ? (
            <ListSkeleton />
          ) : offers.isError ? (
            <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />
          ) : (
            <EmptyState icon="pricetag-outline" title="No student offers today" message="Save your favourite places to hear when they add one." />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
});
