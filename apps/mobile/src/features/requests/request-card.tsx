import type { RequestStatus, ServiceRequest } from '@platform/contracts';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Badge, Card, Icon } from '@/components/ui';
import type { Tint } from '@/theme/tokens';
import { colors, radius, space } from '@/theme/tokens';

export function requestTint(status: RequestStatus): Tint {
  if (status === 'ESTIMATE_AVAILABLE' || status === 'READY') return 'green';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'rose';
  if (status === 'COMPLETED') return 'slate';
  if (status === 'NEW') return 'amber';
  return 'blue';
}

export function RequestCard({ request }: { request: ServiceRequest }) {
  return (
    <Card onPress={() => router.push({ pathname: '/request/[id]', params: { id: request.id } })} style={styles.card}>
      <View style={styles.icon}>
        <Icon name={request.kind === 'TABLE' ? 'notifications-outline' : 'construct-outline'} size={22} color={colors.brand} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={colors.ink} numberOfLines={1}>
          {request.label} · {request.place.name}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {[request.code, request.table, request.estimateAmount !== null ? `estimate ₹${request.estimateAmount}` : null]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
      <Badge label={request.statusLabel} tint={requestTint(request.status)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
});
