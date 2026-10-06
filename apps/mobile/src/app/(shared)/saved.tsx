import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { PlaceCard } from '@/features/places/place-card';
import { placesService } from '@/services/places.service';
import { colors, space } from '@/theme/tokens';

/** My saved businesses. */
export default function SavedPlacesScreen() {
  const saved = useQuery({
    queryKey: ['places', 'saved', 'list'],
    queryFn: ({ signal }) => placesService.savedList(signal).then((r) => r.data),
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Saved places' }} />
      <FlatList
        data={saved.data ?? []}
        keyExtractor={(place) => place.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PlaceCard place={item} />}
        refreshing={saved.isRefetching}
        onRefresh={() => void saved.refetch()}
        ListEmptyComponent={
          saved.isPending ? (
            <ListSkeleton />
          ) : saved.isError ? (
            <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
          ) : (
            <EmptyState
              icon="heart-outline"
              title="Nothing saved yet"
              message="Tap the heart on a mess, library or shop to keep it here. Saved messes tell you when their menu is out."
              actionLabel="Explore places"
              onAction={() => router.navigate('/explore')}
            />
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
