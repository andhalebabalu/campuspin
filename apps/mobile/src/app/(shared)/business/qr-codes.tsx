import type { OwnerQrCode } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, Screen, Sheet, useToast } from '@/components/ui';
import { PlaceSwitcher, usePlaceSelection } from '@/features/business/place-switcher';
import { SITE_URL } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { ordersService } from '@/services/orders.service';
import { colors, space } from '@/theme/tokens';

const linkOf = (token: string) => `${SITE_URL.replace(/\/$/, '')}/q/${token}`;

/**
 * The business QR code and one per table. Show it on screen, share the link to print it, replace a
 * damaged print or switch a code off. Printing the designed card is done from the web dashboard.
 */
export default function QrCodesScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const selection = usePlaceSelection();
  const placeId = selection.place?.id;
  const [showing, setShowing] = useState<OwnerQrCode | null>(null);

  const data = useQuery({
    queryKey: ['business', 'qr', placeId],
    enabled: !!placeId,
    queryFn: async ({ signal }) => {
      const [tables, codes] = await Promise.all([ordersService.tables(placeId!, signal), ordersService.qrCodes(placeId!, signal)]);
      return { tables: tables.data, codes: codes.data };
    },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['business', 'qr', placeId] });
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const create = (tableId?: string) =>
    run.mutate(async () => {
      const code = await ordersService.createQr(placeId!, tableId ? { kind: 'TABLE', tableId } : { kind: 'BUSINESS' });
      setShowing(code.data);
    });

  const codeActions = (code: OwnerQrCode) => (
    <View style={styles.actions}>
      <Button title="Show" size="sm" variant="secondary" fullWidth={false} onPress={() => setShowing(code)} />
      <Button
        title="Replace"
        size="sm"
        variant="ghost"
        fullWidth={false}
        onPress={() =>
          Alert.alert('Make a new code?', 'The old print stops working at once.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Replace', onPress: () => run.mutate(() => ordersService.regenerateQr(code.id)) },
          ])
        }
      />
      <Button
        title={code.status === 'ACTIVE' ? 'Switch off' : 'Switch on'}
        size="sm"
        variant="ghost"
        fullWidth={false}
        onPress={() => run.mutate(() => ordersService.setQrEnabled(code.id, code.status !== 'ACTIVE'))}
      />
    </View>
  );

  const business = data.data?.codes.find((code) => code.kind === 'BUSINESS');

  return (
    <Screen refreshing={data.isRefetching} onRefresh={() => void data.refetch()}>
      <Stack.Screen options={{ title: 'QR codes' }} />
      <View style={styles.gap}>
        <AppText>Students scan these to open your menu and order. Table codes send the table number with each order.</AppText>
        <PlaceSwitcher {...selection} />
        {!placeId && !selection.listings.isPending ? (
          <EmptyState icon="storefront-outline" title="Add a listing first" />
        ) : data.isPending ? (
          <ListSkeleton />
        ) : data.isError ? (
          <ErrorState error={data.error} onRetry={() => void data.refetch()} />
        ) : (
          <>
            <Card style={styles.gap}>
              <AppText variant="subheading">Business QR</AppText>
              <AppText variant="small">For the counter or entrance.{business ? ` Scanned ${business.scanCount} times.` : ''}</AppText>
              {business ? codeActions(business) : <Button title="Generate QR" icon="qr-code-outline" onPress={() => create()} />}
            </Card>
            <Card style={styles.gap}>
              <View style={styles.row}>
                <AppText variant="subheading" style={styles.flex}>
                  Tables ({data.data.tables.length})
                </AppText>
                <Button
                  title="Add 5 tables"
                  icon="add"
                  size="sm"
                  variant="outline"
                  fullWidth={false}
                  onPress={() => run.mutate(() => ordersService.addTables(placeId!, { count: 5 }))}
                />
              </View>
              {data.data.tables.map((table) => {
                const code = data.data.codes.find((item) => item.table?.id === table.id);
                return (
                  <View key={table.id} style={styles.table}>
                    <View style={styles.row}>
                      <AppText variant="bodyStrong" color={colors.ink} style={styles.flex}>
                        {table.label}
                      </AppText>
                      {code && code.status !== 'ACTIVE' ? <Badge label="Code off" tint="rose" /> : null}
                      {code ? <AppText variant="caption">{code.scanCount} scans</AppText> : null}
                    </View>
                    {code ? codeActions(code) : (
                      <Button title="Generate QR" size="sm" variant="secondary" fullWidth={false} onPress={() => create(table.id)} />
                    )}
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </View>

      <Sheet visible={!!showing} onClose={() => setShowing(null)} title={showing?.table?.label ?? selection.place?.name ?? 'QR code'}>
        {showing ? (
          <View style={styles.qr}>
            <View style={styles.qrFrame}>
              <QRCode value={linkOf(showing.token)} size={220} color={colors.brand} />
            </View>
            <AppText variant="small" align="center">
              Scan to order{showing.table ? ` · ${showing.table.label}` : ''}
            </AppText>
            <Button
              title="Share link to print"
              icon="share-outline"
              onPress={() =>
                void Share.share({
                  message: `${selection.place?.name ?? 'CampusPin'}${showing.table ? ` · ${showing.table.label}` : ''}: ${linkOf(showing.token)}`,
                })
              }
            />
            <AppText variant="caption" align="center">
              For a designed card with your name and table number, use QR codes on the web dashboard.
            </AppText>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  table: { gap: space.xs, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  qr: { alignItems: 'center', gap: space.md },
  qrFrame: { padding: space.lg, backgroundColor: colors.surface, borderRadius: 16 },
});
