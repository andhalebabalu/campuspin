import type { Order, OrderStatus } from '@platform/contracts';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Badge, Card, Icon } from '@/components/ui';
import type { Tint } from '@/theme/tokens';
import { colors, radius, space } from '@/theme/tokens';
import { rupees } from './cart';

export function statusTint(status: OrderStatus): Tint {
  if (status === 'READY') return 'green';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'rose';
  if (status === 'COMPLETED' || status === 'SERVED') return 'slate';
  if (status === 'PENDING') return 'amber';
  return 'blue';
}

/** One order in a list: place, code, items, total and status. Opens live tracking. */
export function OrderCard({ order }: { order: Order }) {
  const count = order.items.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <Card onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })} style={styles.card}>
      <View style={styles.icon}>
        <Icon name={order.kind === 'PRINT' ? 'print-outline' : 'fast-food-outline'} size={22} color={colors.brand} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={colors.ink} numberOfLines={1}>
          {order.place.name}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {[order.code, `${count} ${count === 1 ? 'item' : 'items'}`, rupees(order.total), order.table]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
      <Badge label={order.statusLabel} tint={statusTint(order.status)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
