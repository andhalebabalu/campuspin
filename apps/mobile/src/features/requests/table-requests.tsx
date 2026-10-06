import type { TableRequestType } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Badge, Card, Icon, useToast, type IconName } from '@/components/ui';
import { newIdempotencyKey } from '@/features/orders/cart';
import { errorMessage } from '@/lib/errors';
import { engagementService } from '@/services/engagement.service';
import { colors, radius, space } from '@/theme/tokens';

const ICONS: Record<string, IconName> = {
  water: 'water-outline',
  person: 'person-outline',
  cutlery: 'restaurant-outline',
  tissue: 'sparkles-outline',
  bill: 'receipt-outline',
};

/** "Water", "Call staff", "Request bill": one tap from the table, shown as on its way once sent. */
export function TableRequests({ types, qrToken, table }: { types: TableRequestType[]; qrToken: string; table: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const open = useQuery({
    queryKey: ['requests', 'open-at-table', table],
    queryFn: ({ signal }) =>
      engagementService
        .myRequests({ active: true }, signal)
        .then((r) => r.data.filter((request) => request.kind === 'TABLE' && request.table === table)),
    refetchInterval: 10_000,
  });
  const send = useMutation({
    mutationFn: (type: TableRequestType) => {
      let key = keys.current.get(type.id);
      if (!key) {
        key = newIdempotencyKey();
        keys.current.set(type.id, key);
      }
      return engagementService.sendRequest({ kind: 'TABLE', qrToken, requestTypeId: type.id, idempotencyKey: key });
    },
    onSuccess: (_result, type) => {
      keys.current.delete(type.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast(`${type.label}: the staff have been told`);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (types.length === 0) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.title}>
        <Icon name="notifications-outline" size={20} color={colors.brand} />
        <AppText variant="subheading">Need something at {table}?</AppText>
      </View>
      <View style={styles.grid}>
        {types.map((type) => {
          const pending = open.data?.find((request) => request.label === type.label);
          return (
            <Pressable
              key={type.id}
              accessibilityRole="button"
              disabled={!!pending || (send.isPending && send.variables?.id === type.id)}
              onPress={() => send.mutate(type)}
              style={({ pressed }) => [styles.tile, pending && styles.tileOn, pressed && styles.pressed]}
            >
              <Icon name={ICONS[type.icon ?? ''] ?? 'notifications-outline'} size={24} color={colors.brand} />
              <AppText variant="smallStrong" color={colors.ink} align="center">
                {type.label}
              </AppText>
              {pending ? <Badge label={pending.statusLabel} tint="green" /> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '31%',
    flexGrow: 1,
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tileOn: { borderColor: colors.go, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.8 },
});
