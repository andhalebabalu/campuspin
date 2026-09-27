import type { Notification } from '@platform/contracts';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppText, EmptyState, ErrorState, Icon, ListSkeleton, useToast, type IconName } from '@/components/ui';
import { unreadKeys } from '@/hooks/use-unread';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { appRouteFor } from '@/lib/links';
import { notificationsService } from '@/services/notifications.service';
import { colors, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 20;

function iconFor(type: string): IconName {
  const key = type.toUpperCase();
  if (key.includes('MESSAGE')) return 'chatbubble-ellipses';
  if (key.includes('LISTING') || key.includes('MARKET')) return 'pricetag';
  if (key.includes('EVENT')) return 'calendar';
  if (key.includes('JOB')) return 'briefcase';
  if (key.includes('VERIF') || key.includes('STUDENT')) return 'shield-checkmark';
  if (key.includes('COMMENT') || key.includes('POST') || key.includes('COMMUNITY')) return 'chatbubbles';
  if (key.includes('REVIEW')) return 'star';
  return 'notifications';
}

export default function Notifications() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => notificationsService.list({ page: pageParam }, signal).then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const items = query.data?.pages.flat() ?? [];
  const anyUnread = items.some((item) => !item.read);

  function refreshCounts() {
    void queryClient.invalidateQueries({ queryKey: unreadKeys.notifications });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
  }

  async function open(item: Notification) {
    if (!item.read) {
      notificationsService.markRead(item.id).then(refreshCounts).catch(() => undefined);
    }
    const route = appRouteFor(item.link);
    if (route) router.push(route);
  }

  async function markAll() {
    try {
      await notificationsService.markAllRead();
      refreshCounts();
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: anyUnread
            ? () => (
                <Pressable hitSlop={10} onPress={() => void markAll()}>
                  <AppText variant="smallStrong" color={colors.action}>
                    Mark all read
                  </AppText>
                </Pressable>
              )
            : undefined,
        }}
      />
      {query.isPending ? (
        <ListSkeleton count={6} height={80} />
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
            <EmptyState icon="notifications-off-outline" title="You’re all caught up" message="Replies, messages and updates about your account show up here." />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void open(item)}
              style={({ pressed }) => [styles.row, !item.read && styles.unread, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.icon, !item.read && { backgroundColor: colors.action }]}>
                <Icon name={iconFor(item.type)} size={19} color={item.read ? colors.action : colors.surface} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{item.title}</AppText>
                <AppText variant="small" numberOfLines={3}>
                  {item.message}
                </AppText>
                <AppText variant="caption">{timeAgo(item.createdAt)}</AppText>
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1, gap: 2 },
  list: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  unread: { backgroundColor: '#f5f9ff', borderColor: colors.primaryBorder },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.action, marginTop: 6 },
});
