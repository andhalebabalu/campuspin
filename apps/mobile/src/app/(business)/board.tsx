import {
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  REQUEST_STATUS_LABELS,
  type BusinessOrder,
  type BusinessServiceRequest,
  type OrderStatus,
  type RequestStatus,
} from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, Segmented, TabHeader, useToast } from '@/components/ui';
import { rupees } from '@/features/orders/cart';
import { statusTint } from '@/features/orders/order-card';
import { errorMessage } from '@/lib/errors';
import { bookingTint, bookingWhen } from '@/features/bookings/booking-panel';
import { requestTint } from '@/features/requests/request-card';
import { bookingsService } from '@/services/bookings.service';
import { engagementService } from '@/services/engagement.service';
import { ordersService } from '@/services/orders.service';
import { colors, space } from '@/theme/tokens';

type Scope = 'active' | 'today' | 'all';

const ACTION: Record<OrderStatus, string> = {
  PENDING: '',
  ACCEPTED: 'Accept',
  PREPARING: 'Start preparing',
  READY: 'Mark ready',
  SERVED: 'Served',
  COMPLETED: 'Complete',
  CANCELLED: 'Cancel',
  REJECTED: 'Reject',
};

function minutesAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function Ticket({ order, scope }: { order: BusinessOrder; scope: Scope }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: ({ status, reason }: { status: OrderStatus; reason?: string }) =>
      ordersService.updateStatus(order.id, status, reason).then((r) => r.data),
    onSuccess: (next, { status }) => {
      queryClient.setQueryData<BusinessOrder[]>(['business', 'board', scope], (list) =>
        list?.map((item) => (item.id === next.id ? next : item)),
      );
      toast(`${order.code}: ${ORDER_STATUS_LABELS[order.kind][status]}`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const stop = (status: OrderStatus) =>
    Alert.alert(`${ACTION[status]} order ${order.code}?`, 'The student is told straight away.', [
      { text: 'Back', style: 'cancel' },
      { text: ACTION[status], style: 'destructive', onPress: () => move.mutate({ status }) },
    ]);

  return (
    <Card style={[styles.gap, order.status === 'PENDING' && styles.pending]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="title" color={colors.brand}>
            {order.table ?? 'Pickup'}
          </AppText>
          <AppText variant="small">
            {order.code} · {order.student.name} · {minutesAgo(order.createdAt)}
          </AppText>
        </View>
        <Badge label={order.statusLabel} tint={statusTint(order.status)} />
      </View>
      {order.items.map((line, index) => (
        <AppText key={`${line.name}-${index}`} color={colors.ink}>
          <AppText variant="bodyStrong">{line.quantity} ×</AppText> {line.name}
          {line.options.length > 0 ? ` (${line.options.map((option) => option.name).join(', ')})` : ''}
        </AppText>
      ))}
      {order.print ? (
        <AppText variant="small" color={colors.brand}>
          {order.print.fileName} · {order.print.pageCount} pages × {order.print.copies} · {order.print.color ? 'colour' : 'B/W'} ·{' '}
          {order.print.paperSize}
          {order.print.doubleSided ? ' · double-sided' : ''}
          {order.print.binding ? ' · binding' : ''}
          {order.print.lamination ? ' · lamination' : ''}
        </AppText>
      ) : null}
      {order.print ? <AppText variant="caption">Download the PDF from the web dashboard (Orders).</AppText> : null}
      {order.note ? (
        <AppText variant="small" color={colors.warning}>
          Note: {order.note}
        </AppText>
      ) : null}
      <AppText variant="small">
        {rupees(order.total)} · {PAYMENT_LABELS[order.paymentMethod]}
      </AppText>
      {order.nextStatuses.length > 0 ? (
        <View style={styles.actions}>
          {order.nextStatuses
            .filter((status) => status !== 'REJECTED' && status !== 'CANCELLED')
            .map((status) => (
              <Button
                key={status}
                title={ACTION[status]}
                size="sm"
                variant="success"
                fullWidth={false}
                loading={move.isPending && move.variables?.status === status}
                onPress={() => move.mutate({ status })}
              />
            ))}
          {order.nextStatuses
            .filter((status) => status === 'REJECTED' || status === 'CANCELLED')
            .map((status) => (
              <Button key={status} title={ACTION[status]} size="sm" variant="ghost" fullWidth={false} onPress={() => stop(status)} />
            ))}
        </View>
      ) : null}
    </Card>
  );
}

const REQUEST_ACTION: Partial<Record<RequestStatus, string>> = {
  ACKNOWLEDGED: 'On my way',
  ACCEPTED: 'Accept',
  DIAGNOSING: 'Checking',
  IN_PROGRESS: 'Start work',
  READY: 'Ready',
  COMPLETED: 'Done',
  CANCELLED: 'Cancel',
  REJECTED: 'Decline',
};

/** A table request or job. Estimates are sent from the web dashboard. */
function RequestTicket({ request }: { request: BusinessServiceRequest }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: (status: RequestStatus) => engagementService.updateRequest(request.id, { status }).then((r) => r.data),
    onSuccess: (_next, status) => {
      void queryClient.invalidateQueries({ queryKey: ['business', 'requests'] });
      toast(`${request.label}: ${REQUEST_STATUS_LABELS[status]}`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const moves = request.nextStatuses.filter((status) => REQUEST_ACTION[status]);
  return (
    <Card style={[styles.gap, request.status === 'NEW' && styles.pending]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="title" color={colors.brand}>
            {request.kind === 'TABLE' ? `${request.table}: ${request.label}` : request.label}
          </AppText>
          <AppText variant="small">
            {request.code} · {request.student.name} · {minutesAgo(request.createdAt)}
          </AppText>
        </View>
        <Badge label={request.statusLabel} tint={requestTint(request.status)} />
      </View>
      {request.description ? <AppText>{request.description}</AppText> : null}
      {moves.length > 0 ? (
        <View style={styles.actions}>
          {moves.map((status) => (
            <Button
              key={status}
              title={REQUEST_ACTION[status] ?? status}
              size="sm"
              variant={status === 'CANCELLED' || status === 'REJECTED' ? 'ghost' : 'success'}
              fullWidth={false}
              loading={move.isPending && move.variables === status}
              onPress={() => move.mutate(status)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Upcoming bookings with confirm / done / no-show. Opening hours and bookable items are set on the web. */
function BookingBoard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const bookings = useQuery({
    queryKey: ['business', 'bookings'],
    queryFn: ({ signal }) => bookingsService.businessList({ scope: 'upcoming' }, signal).then((r) => r.data),
    refetchInterval: 15_000,
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED' }) =>
      bookingsService.updateStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['business', 'bookings'] }),
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const labels = { CONFIRMED: 'Confirm', COMPLETED: 'Done', NO_SHOW: 'No-show', CANCELLED: 'Cancel' } as const;
  return (
    <FlatList
      data={bookings.data ?? []}
      keyExtractor={(booking) => booking.id}
      contentContainerStyle={styles.list}
      refreshing={bookings.isRefetching}
      onRefresh={() => void bookings.refetch()}
      renderItem={({ item }) => (
        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="subheading">{item.itemName}</AppText>
              <AppText variant="small">
                {bookingWhen(item)} · {item.student.name} · seat {item.seatNo}
              </AppText>
            </View>
            <Badge label={item.statusLabel} tint={bookingTint(item.status)} />
          </View>
          <View style={styles.actions}>
            {item.nextStatuses.map((status) =>
              status === 'PENDING' ? null : (
                <Button
                  key={status}
                  title={labels[status]}
                  size="sm"
                  variant={status === 'CONFIRMED' || status === 'COMPLETED' ? 'success' : 'ghost'}
                  fullWidth={false}
                  onPress={() => move.mutate({ id: item.id, status })}
                />
              ),
            )}
          </View>
        </Card>
      )}
      ListEmptyComponent={
        bookings.isPending ? (
          <ListSkeleton />
        ) : bookings.isError ? (
          <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        ) : (
          <EmptyState icon="calendar-outline" title="No upcoming bookings" message="Set opening hours and bookable items on the web dashboard (Bookings)." />
        )
      }
    />
  );
}

/** The live board: orders and requests, refreshed every 5 seconds, with a buzz for new ones. */
export default function OrderBoard() {
  const [mode, setMode] = useState<'orders' | 'requests' | 'bookings'>('orders');
  const [scope, setScope] = useState<Scope>('active');
  const requests = useQuery({
    queryKey: ['business', 'requests', scope],
    enabled: mode === 'requests',
    queryFn: ({ signal }) => engagementService.businessRequests({ scope }, signal).then((r) => r.data),
    refetchInterval: 5_000,
  });
  const seen = useRef<Set<string> | null>(null);
  const board = useQuery({
    queryKey: ['business', 'board', scope],
    queryFn: ({ signal }) => ordersService.businessOrders({ scope }, signal).then((r) => r.data),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!board.data || scope !== 'active') return;
    const ids = board.data.filter((order) => order.status === 'PENDING').map((order) => order.id);
    if (seen.current && ids.some((id) => !seen.current!.has(id))) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
    seen.current = new Set(board.data.map((order) => order.id));
  }, [board.data, scope]);

  return (
    <View style={styles.root}>
      <TabHeader title="Orders" subtitle="Updates every few seconds" />
      <View style={styles.segments}>
        <Segmented
          options={[
            { value: 'orders', label: 'Orders' },
            { value: 'requests', label: 'Requests' },
            { value: 'bookings', label: 'Bookings' },
          ]}
          value={mode}
          onChange={setMode}
          tone="brand"
        />
      </View>
      <View style={styles.segments}>
        <Segmented
          options={[
            { value: 'active', label: 'In progress' },
            { value: 'today', label: 'Today' },
            { value: 'all', label: 'All' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </View>
      {mode === 'bookings' ? <BookingBoard /> : null}
      {mode === 'requests' ? (
        <FlatList
          data={requests.data ?? []}
          keyExtractor={(request) => request.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <RequestTicket request={item} />}
          ListEmptyComponent={
            requests.isPending ? (
              <ListSkeleton height={140} />
            ) : requests.isError ? (
              <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
            ) : (
              <EmptyState icon="notifications-outline" title="No open requests" message="Table requests and jobs appear here within seconds." />
            )
          }
        />
      ) : null}
      {mode === 'orders' ? (
      <FlatList
        data={board.data ?? []}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Ticket order={item} scope={scope} />}
        refreshing={board.isRefetching && !board.isFetchedAfterMount}
        onRefresh={() => void board.refetch()}
        ListEmptyComponent={
          board.isPending ? (
            <ListSkeleton height={160} />
          ) : board.isError ? (
            <ErrorState error={board.error} onRetry={() => void board.refetch()} />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={scope === 'active' ? 'No orders in progress' : 'No orders yet'}
              message="New orders appear here within a few seconds. Switch on Order Food in Services and print your table QR codes."
            />
          )
        }
      />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  gap: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  pending: { borderWidth: 2, borderColor: colors.warning },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.sm },
  segments: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl * 3 },
});
