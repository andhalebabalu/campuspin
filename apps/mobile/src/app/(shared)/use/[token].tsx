import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { EmptyState, ErrorState, LoadingView } from '@/components/ui';
import { OfferCard } from '@/features/offers/offer-card';
import { OrderingScreen } from '@/features/orders/ordering-screen';
import { TableRequests } from '@/features/requests/table-requests';
import { isApiError } from '@/lib/errors';
import { ordersService } from '@/services/orders.service';
import { colors } from '@/theme/tokens';

/** Where a scanned CampusPin code leads: the place (and table) and what can be used there. */
export default function UseScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const resolved = useQuery({
    queryKey: ['qr', token],
    queryFn: ({ signal }) => ordersService.resolveQr(token, signal).then((r) => r.data),
    retry: false,
    staleTime: Infinity,
  });

  if (resolved.isPending) return <LoadingView />;
  if (resolved.isError) {
    const gone = isApiError(resolved.error, 410);
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.canvas }}>
        <Stack.Screen options={{ title: 'CampusPin code' }} />
        {gone || isApiError(resolved.error, 404) ? (
          <EmptyState
            icon="qr-code-outline"
            title={gone ? 'This code is no longer in use' : 'Not a CampusPin code'}
            message={gone ? 'Ask the staff for the current code.' : 'Try scanning the CampusPin card again.'}
            actionLabel="Scan again"
            onAction={() => router.replace('/scan')}
          />
        ) : (
          <ErrorState error={resolved.error} onRetry={() => void resolved.refetch()} />
        )}
      </View>
    );
  }
  const table = resolved.data.kind === 'TABLE' ? resolved.data.table?.label : undefined;
  return (
    <>
      <Stack.Screen options={{ title: resolved.data.place.name }} />
      <OrderingScreen
        slug={resolved.data.place.slug}
        {...(table ? { qrToken: token, tableLabel: table } : {})}
        extra={(services) => (
          <>
            {table ? <TableRequests types={services.tableRequests} qrToken={token} table={table} /> : null}
            {services.offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} showPlace={false} />
            ))}
          </>
        )}
      />
    </>
  );
}
