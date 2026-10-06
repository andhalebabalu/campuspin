import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppText, Button, EmptyState, ErrorState, Icon, ListSkeleton } from '@/components/ui';
import { PlaceCard } from '@/features/places/place-card';
import { serviceIcon } from '@/features/services/meta';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { isApiError } from '@/lib/errors';
import { servicesService } from '@/services/services.service';
import { colors, radius, space } from '@/theme/tokens';

/** Places that offer one service (a quick action), nearest first when the location is known. */
export default function ServicePlacesScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const location = useDeviceLocation();
  const types = useQuery({
    queryKey: ['service-types'],
    queryFn: ({ signal }) => servicesService.types(signal).then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const type = types.data?.find((item) => item.key === key);
  const places = useInfiniteQuery({
    queryKey: ['service-places', key, location.point],
    enabled: location.ready,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      servicesService.typePlaces(key, { ...location.point, page: pageParam }, signal),
    getNextPageParam: (last) =>
      last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
  const items = places.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: type?.name ?? 'Services' }} />
      <FlatList
        data={items}
        keyExtractor={(place) => place.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PlaceCard place={item} />}
        onEndReached={() => {
          if (places.hasNextPage && !places.isFetchingNextPage) void places.fetchNextPage();
        }}
        refreshing={places.isRefetching}
        onRefresh={() => void places.refetch()}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.icon}>
              <Icon name={serviceIcon(type?.icon ?? null)} size={26} color={colors.brand} />
            </View>
            <View style={styles.flex}>
              {type?.description ? <AppText>{type.description}</AppText> : null}
              {!location.point ? (
                <Button
                  title="Show nearest first"
                  icon="navigate-outline"
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                  onPress={() => void location.request()}
                />
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          places.isPending || !location.ready ? (
            <ListSkeleton />
          ) : places.isError ? (
            isApiError(places.error, 404) ? (
              <EmptyState
                icon="help-circle-outline"
                title="This service isn’t available"
                message="It may have been switched off."
              />
            ) : (
              <ErrorState error={places.error} onRetry={() => void places.refetch()} />
            )
          ) : (
            <EmptyState
              icon={serviceIcon(type?.icon ?? null)}
              title={
                type?.kind === 'OFFERS'
                  ? 'No student offers right now'
                  : `No place offers ${type?.name ?? 'this'} yet`
              }
              message="Businesses are joining CampusPin every week. Know one that should be here?"
              actionLabel="Suggest a place"
              onAction={() => router.push('/suggest-place')}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1, gap: space.sm },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  header: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginBottom: space.sm },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
