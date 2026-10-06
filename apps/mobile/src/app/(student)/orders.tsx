import type { Redemption } from '@platform/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, IconButton, ListSkeleton, Segmented, TabHeader } from '@/components/ui';
import { OrderCard } from '@/features/orders/order-card';
import { CodeSheet } from '@/features/offers/offer-card';
import { RequestCard } from '@/features/requests/request-card';
import { BookingCard } from '@/features/bookings/booking-panel';
import { bookingsService } from '@/services/bookings.service';
import { engagementService } from '@/services/engagement.service';
import { ordersService } from '@/services/orders.service';
import { colors, space } from '@/theme/tokens';

type Segment = 'food' | 'print';

/** Bookings, service requests and offer codes join these as they are added. */
const ORDER_SEGMENTS: { value: string; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'print', label: 'Print' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'requests', label: 'Requests' },
  { value: 'codes', label: 'Offers' },
];

/** Everything the student ordered or asked for, in one place. */
export default function OrdersTab() {
  const [segment, setSegment] = useState<string>('food');
  return (
    <View style={styles.root}>
      <TabHeader
        title="Orders"
        subtitle="Food, print, bookings and requests"
        right={<IconButton icon="qr-code-outline" label="Scan a CampusPin code" onPress={() => router.push('/scan')} />}
      />
      <View style={styles.segments}>
        <Segmented options={ORDER_SEGMENTS} value={segment} onChange={setSegment} />
      </View>
      {segment === 'food' || segment === 'print' ? <OrderList kind={segment} /> : null}
      {segment === 'bookings' ? <BookingList /> : null}
      {segment === 'requests' ? <RequestList /> : null}
      {segment === 'codes' ? <CodeList /> : null}
    </View>
  );
}

function OrderList({ kind }: { kind: Segment }): ReactNode {
  const orders = useInfiniteQuery({
    queryKey: ['orders', kind],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      ordersService.myOrders({ kind: kind === 'print' ? 'PRINT' : 'FOOD', page: pageParam }, signal),
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    refetchInterval: 20_000,
  });
  const items = orders.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(order) => order.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <OrderCard order={item} />}
      refreshing={orders.isRefetching}
      onRefresh={() => void orders.refetch()}
      onEndReached={() => {
        if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
      }}
      ListEmptyComponent={
        orders.isPending ? (
          <ListSkeleton />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
        ) : kind === 'print' ? (
          <EmptyState
            icon="print-outline"
            title="No print orders yet"
            message="Send a PDF to a xerox shop near you and pick it up when it’s ready."
            actionLabel="Find a print shop"
            onAction={() => router.push({ pathname: '/service/[key]', params: { key: 'PRINT' } })}
          />
        ) : (
          <EmptyState
            icon="fast-food-outline"
            title="No food orders yet"
            message="Scan the CampusPin code on a restaurant table to order from your seat."
            actionLabel="Scan a code"
            onAction={() => router.push('/scan')}
          />
        )
      }
    />
  );
}

function BookingList(): ReactNode {
  const queryClient = useQueryClient();
  const bookings = useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: ({ signal }) => bookingsService.mine({}, signal).then((r) => r.data),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => bookingsService.cancel(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
  return (
    <FlatList
      data={bookings.data ?? []}
      keyExtractor={(booking) => booking.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <BookingCard
          booking={item}
          onCancel={() =>
            Alert.alert(`Cancel ${item.itemName}?`, undefined, [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Cancel booking', style: 'destructive', onPress: () => cancel.mutate(item.id) },
            ])
          }
        />
      )}
      refreshing={bookings.isRefetching}
      onRefresh={() => void bookings.refetch()}
      ListEmptyComponent={
        bookings.isPending ? (
          <ListSkeleton />
        ) : bookings.isError ? (
          <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        ) : (
          <EmptyState icon="calendar-outline" title="No bookings yet" message="Book a salon slot, a study seat or an appointment from a place." />
        )
      }
    />
  );
}

function RequestList(): ReactNode {
  const requests = useQuery({
    queryKey: ['requests', 'mine'],
    queryFn: ({ signal }) => engagementService.myRequests({}, signal).then((r) => r.data),
    refetchInterval: 20_000,
  });
  return (
    <FlatList
      data={requests.data ?? []}
      keyExtractor={(request) => request.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <RequestCard request={item} />}
      refreshing={requests.isRefetching}
      onRefresh={() => void requests.refetch()}
      ListEmptyComponent={
        requests.isPending ? (
          <ListSkeleton />
        ) : requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : (
          <EmptyState icon="construct-outline" title="No requests yet" message="Call the staff from your table, or ask a repair shop or laundry to take a job." />
        )
      }
    />
  );
}

function CodeList(): ReactNode {
  const [showing, setShowing] = useState<Redemption | null>(null);
  const codes = useQuery({
    queryKey: ['redemptions', 'mine'],
    queryFn: ({ signal }) => engagementService.myRedemptions(1, signal).then((r) => r.data),
  });
  return (
    <>
      <FlatList
        data={codes.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={codes.isRefetching}
        onRefresh={() => void codes.refetch()}
        renderItem={({ item }) => (
          <Card style={styles.code}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" color={colors.ink}>
                {item.offer.headline} · {item.place.name}
              </AppText>
              <AppText variant="small">
                {item.offer.title}
                {item.discountAmount > 0 ? ` · saved ₹${item.discountAmount}` : ''}
              </AppText>
            </View>
            {item.status === 'ISSUED' ? (
              <Button title="Show" size="sm" fullWidth={false} onPress={() => setShowing(item)} />
            ) : (
              <Badge label={item.status === 'REDEEMED' ? 'Used' : 'Expired'} tint={item.status === 'REDEEMED' ? 'green' : 'slate'} />
            )}
          </Card>
        )}
        ListEmptyComponent={
          codes.isPending ? (
            <ListSkeleton />
          ) : codes.isError ? (
            <ErrorState error={codes.error} onRetry={() => void codes.refetch()} />
          ) : (
            <EmptyState icon="pricetag-outline" title="No offers used yet" message="Get a code from a student offer and show it at the counter." actionLabel="See offers" onAction={() => router.push('/offers')} />
          )
        }
      />
      <CodeSheet redemption={showing} onClose={() => setShowing(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  code: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  root: { flex: 1, backgroundColor: colors.canvas },
  segments: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl * 3 },
});
