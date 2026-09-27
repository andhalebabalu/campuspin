import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppText, Avatar, Button, EmptyState, ErrorState, ListSkeleton, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { safetyService } from '@/services/safety.service';
import { colors, radius, space } from '@/theme/tokens';

export default function Blocked() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['blocks'],
    queryFn: ({ signal }) => safetyService.blocks(signal).then((r) => r.data),
  });

  async function unblock(id: string, name: string) {
    try {
      queryClient.setQueryData(['blocks'], (await safetyService.unblock(id)).data);
      void queryClient.invalidateQueries({ queryKey: ['community'] });
      void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      toast(`${name} is unblocked.`);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Blocked members' }} />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={query.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="happy-outline"
              title="No one is blocked"
              message="Blocked members can’t message you, and you won’t see their posts or listings."
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar name={item.displayName} size={42} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{item.displayName}</AppText>
                <AppText variant="caption">Blocked {formatDate(item.blockedAt)}</AppText>
              </View>
              <Button
                title="Unblock"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => void unblock(item.id, item.displayName)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  list: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
});
