import { FINAL_ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_LABELS, type OrderStatus } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, Icon, LoadingView, Screen, useToast } from '@/components/ui';
import { rupees } from '@/features/orders/cart';
import { statusTint } from '@/features/orders/order-card';
import { errorMessage, isApiError } from '@/lib/errors';
import { ordersService } from '@/services/orders.service';
import { colors, radius, space } from '@/theme/tokens';

const STEPS: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Live status of one order: refreshed every 10 seconds until it is finished. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: ({ signal }) => ordersService.myOrder(id, signal).then((r) => r.data),
    refetchInterval: (query) =>
      query.state.data && FINAL_ORDER_STATUSES.includes(query.state.data.status) ? false : 10_000,
  });
  const cancel = useMutation({
    mutationFn: () => ordersService.cancelMine(id).then((r) => r.data),
    onSuccess: (next) => {
      queryClient.setQueryData(['order', id], next);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast('Order cancelled');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (order.isPending) return <LoadingView />;
  if (order.isError) {
    return isApiError(order.error, 404) ? (
      <EmptyState icon="receipt-outline" title="Order not found" />
    ) : (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    );
  }
  const data = order.data;
  const labels = ORDER_STATUS_LABELS[data.kind];
  const reached = new Set(data.history.map((entry) => entry.status));
  const stopped = data.status === 'CANCELLED' || data.status === 'REJECTED';
  const finished = FINAL_ORDER_STATUSES.includes(data.status);

  return (
    <Screen refreshing={order.isRefetching} onRefresh={() => void order.refetch()}>
      <Stack.Screen options={{ title: `Order ${data.code}` }} />
      <View style={styles.gap}>
        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="title" color={colors.brand}>
                {data.place.name}
              </AppText>
              <AppText variant="small">{[data.code, data.table].filter(Boolean).join(' · ')}</AppText>
            </View>
            <Badge label={data.statusLabel} tint={statusTint(data.status)} />
          </View>
          {stopped ? (
            <AppText color={colors.danger}>
              {data.status === 'REJECTED' ? 'The business could not take this order.' : 'This order was cancelled.'}
              {data.statusReason ? ` ${data.statusReason}` : ''}
            </AppText>
          ) : (
            <View style={styles.steps}>
              {STEPS.map((step) => {
                const done = reached.has(step) || data.status === step;
                return (
                  <View key={step} style={styles.step}>
                    <View style={[styles.stepBar, done && styles.stepDone]} />
                    <AppText variant="caption" color={done ? colors.ink : colors.muted} numberOfLines={2}>
                      {labels[step]}
                    </AppText>
                  </View>
                );
              })}
            </View>
          )}
          {!finished ? (
            <View style={styles.row}>
              <Icon name="sync-outline" size={14} color={colors.muted} />
              <AppText variant="caption">Updates automatically</AppText>
            </View>
          ) : null}
        </Card>

        <Card style={styles.gap}>
          <AppText variant="subheading">Items</AppText>
          {data.items.map((line, index) => (
            <View key={`${line.name}-${index}`} style={styles.row}>
              <View style={styles.flex}>
                <AppText color={colors.ink}>
                  {line.quantity} × {line.name}
                </AppText>
                {line.options.length > 0 ? (
                  <AppText variant="small">{line.options.map((option) => option.name).join(', ')}</AppText>
                ) : null}
              </View>
              <AppText>{rupees(line.lineTotal)}</AppText>
            </View>
          ))}
          <View style={styles.divider} />
          {data.discount > 0 ? (
            <View style={styles.row}>
              <AppText color={colors.success} style={styles.flex}>
                Student offer
              </AppText>
              <AppText color={colors.success}>−{rupees(data.discount)}</AppText>
            </View>
          ) : null}
          <View style={styles.row}>
            <AppText variant="heading" style={styles.flex}>
              Total
            </AppText>
            <AppText variant="heading">{rupees(data.total)}</AppText>
          </View>
          <AppText variant="small">{PAYMENT_LABELS[data.paymentMethod]}</AppText>
          {data.note ? <AppText variant="small">Note: {data.note}</AppText> : null}
          {data.print ? (
            <AppText variant="small" color={colors.brand}>
              {data.print.fileName} · {data.print.pageCount} pages × {data.print.copies} · {data.print.color ? 'colour' : 'B/W'} ·{' '}
              {data.print.paperSize}
              {data.print.doubleSided ? ' · double-sided' : ''}
              {data.print.binding ? ' · binding' : ''}
              {data.print.lamination ? ' · lamination' : ''}
            </AppText>
          ) : null}
        </Card>

        {data.history.length > 0 ? (
          <Card style={styles.gap}>
            <AppText variant="subheading">Timeline</AppText>
            {data.history.map((entry) => (
              <View key={`${entry.status}-${entry.at}`} style={styles.row}>
                <AppText color={colors.ink} style={styles.flex}>
                  {labels[entry.status]}
                </AppText>
                <AppText variant="small">{time(entry.at)}</AppText>
              </View>
            ))}
          </Card>
        ) : null}

        {data.cancellable ? (
          <Button
            title="Cancel order"
            variant="secondary"
            loading={cancel.isPending}
            onPress={() =>
              Alert.alert('Cancel this order?', undefined, [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel order', style: 'destructive', onPress: () => cancel.mutate() },
              ])
            }
          />
        ) : null}
        {data.status === 'COMPLETED' ? (
          <Button
            title={`Review ${data.place.name}`}
            icon="star-outline"
            onPress={() => router.push({ pathname: '/place/review/[slug]', params: { slug: data.place.slug } })}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  steps: { flexDirection: 'row', gap: space.xs },
  step: { flex: 1, gap: space.xs },
  stepBar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line },
  stepDone: { backgroundColor: colors.go },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
