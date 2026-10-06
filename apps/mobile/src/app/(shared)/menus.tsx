import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppText, Button, EmptyState, ErrorState, ListSkeleton, Segmented } from '@/components/ui';
import { MessMenuCard } from '@/features/services/menu-card';
import { dayLabel, indiaDate } from '@/features/services/meta';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { servicesService } from '@/services/services.service';
import { colors, space } from '@/theme/tokens';

/** Every mess that published today's menu: saved ones first, then nearest. */
export default function TodaysMenusScreen() {
  const location = useDeviceLocation();
  const [scope, setScope] = useState<'all' | 'saved'>('all');
  const menus = useQuery({
    queryKey: ['menus', 'today', scope, location.point],
    enabled: location.ready,
    queryFn: ({ signal }) =>
      servicesService
        .todaysMenus({ ...location.point, saved: scope === 'saved' }, signal)
        .then((r) => r.data),
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Today’s mess menu' }} />
      <FlatList
        data={menus.data ?? []}
        keyExtractor={(card) => card.place.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <MessMenuCard card={item} />}
        refreshing={menus.isRefetching}
        onRefresh={() => void menus.refetch()}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText variant="smallStrong" color={colors.accent}>
              {dayLabel(indiaDate())}
            </AppText>
            <Segmented
              options={[
                { value: 'all', label: 'Near me' },
                { value: 'saved', label: 'My saved messes', icon: 'heart' },
              ]}
              value={scope}
              onChange={setScope}
            />
            {!location.point ? (
              <Button
                title="Show nearest first"
                icon="navigate-outline"
                variant="outline"
                size="sm"
                onPress={() => void location.request()}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          menus.isPending ? (
            <ListSkeleton height={160} />
          ) : menus.isError ? (
            <ErrorState error={menus.error} onRetry={() => void menus.refetch()} />
          ) : (
            <EmptyState
              icon="restaurant-outline"
              title={
                scope === 'saved'
                  ? 'Your saved messes haven’t published yet'
                  : 'No menus published yet today'
              }
              message={
                scope === 'saved'
                  ? 'You’ll get a notification as soon as they do.'
                  : 'Messes publish their menu on CampusPin each morning. Save your mess to hear first.'
              }
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
  header: { gap: space.md, marginBottom: space.xs },
});
