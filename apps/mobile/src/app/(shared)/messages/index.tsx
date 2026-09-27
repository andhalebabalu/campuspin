import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppText, Avatar, Badge, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { ListingImage } from '@/features/marketplace/listing-card';
import { unreadKeys } from '@/hooks/use-unread';
import { price, timeAgo } from '@/lib/format';
import { messagesService } from '@/services/messages.service';
import { colors, radius, space } from '@/theme/tokens';

/** My marketplace conversations with buyers and sellers. */
export default function Conversations() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: ({ signal }) => messagesService.conversations(1, signal).then((r) => r.data),
    refetchInterval: 15_000,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: unreadKeys.messages });
    }, [queryClient]),
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Messages' }} />
      {query.isPending ? (
        <ListSkeleton count={6} height={80} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={query.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.action} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No messages yet"
              message="When you message a seller, or a buyer messages you, the chat shows up here."
              actionLabel="Browse the marketplace"
              onAction={() => router.navigate('/market')}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.subtle }]}
            >
              <View>
                <Avatar name={item.other.displayName} size={52} verified={item.other.verifiedStudent} />
              </View>
              <View style={styles.flex}>
                <View style={styles.line}>
                  <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {item.other.displayName}
                  </AppText>
                  <AppText variant="caption" color={item.unread ? colors.action : colors.muted}>
                    {timeAgo(item.lastMessageAt)}
                  </AppText>
                </View>
                <AppText variant="small" color={colors.ink} numberOfLines={1}>
                  {item.listing.title} · {price(item.listing.price)}
                </AppText>
                <View style={styles.line}>
                  <AppText
                    variant={item.unread ? 'smallStrong' : 'small'}
                    color={item.unread ? colors.ink : colors.body}
                    numberOfLines={1}
                    style={styles.flex}
                  >
                    {item.blocked ? 'Blocked' : (item.lastMessage ?? 'No messages yet')}
                  </AppText>
                  {item.unread ? <View style={styles.dot} /> : null}
                </View>
                <Badge label={item.role === 'SELLER' ? 'You’re selling' : 'You’re buying'} tint={item.role === 'SELLER' ? 'green' : 'blue'} />
              </View>
              <ListingImage url={item.listing.coverImageUrl} category="OTHER" style={styles.thumb} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  list: { paddingVertical: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.action },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 84 },
});
