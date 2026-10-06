import { FINAL_REQUEST_STATUSES, REQUEST_STATUS_LABELS } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, Icon, LoadingView, Screen, useToast } from '@/components/ui';
import { requestTint } from '@/features/requests/request-card';
import { errorMessage, isApiError } from '@/lib/errors';
import { engagementService } from '@/services/engagement.service';
import { colors, space } from '@/theme/tokens';

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** One request: status, timeline, estimate to approve. Refreshes every 10 seconds while open. */
export default function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const request = useQuery({
    queryKey: ['request', id],
    queryFn: ({ signal }) => engagementService.myRequest(id, signal).then((r) => r.data),
    refetchInterval: (query) =>
      query.state.data && FINAL_REQUEST_STATUSES.includes(query.state.data.status) ? false : 10_000,
  });
  const act = useMutation({
    mutationFn: (kind: 'cancel' | 'approve') =>
      (kind === 'cancel' ? engagementService.cancelRequest(id) : engagementService.approveEstimate(id)).then((r) => r.data),
    onSuccess: (next, kind) => {
      queryClient.setQueryData(['request', id], next);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast(kind === 'cancel' ? 'Request cancelled' : 'Estimate approved: the work can start');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (request.isPending) return <LoadingView />;
  if (request.isError) {
    return isApiError(request.error, 404) ? (
      <EmptyState icon="construct-outline" title="Request not found" />
    ) : (
      <ErrorState error={request.error} onRetry={() => void request.refetch()} />
    );
  }
  const data = request.data;
  const finished = FINAL_REQUEST_STATUSES.includes(data.status);

  return (
    <Screen refreshing={request.isRefetching} onRefresh={() => void request.refetch()}>
      <Stack.Screen options={{ title: data.code }} />
      <View style={styles.gap}>
        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="small">{data.service.name}</AppText>
              <AppText variant="title" color={colors.brand}>
                {data.label}
              </AppText>
              <AppText variant="small">{[data.place.name, data.table].filter(Boolean).join(' · ')}</AppText>
            </View>
            <Badge label={data.statusLabel} tint={requestTint(data.status)} />
          </View>
          {data.description ? <AppText>{data.description}</AppText> : null}
          {data.statusReason ? <AppText variant="small">Note from the business: {data.statusReason}</AppText> : null}
          {!finished ? (
            <View style={styles.row}>
              <Icon name="sync-outline" size={14} color={colors.muted} />
              <AppText variant="caption">Updates automatically</AppText>
            </View>
          ) : null}
        </Card>

        {data.estimateAmount !== null ? (
          <Card style={styles.gap}>
            <AppText variant="smallStrong" color={colors.accent}>
              Estimate
            </AppText>
            <AppText variant="hero">₹{data.estimateAmount}</AppText>
            {data.estimateNote ? <AppText>{data.estimateNote}</AppText> : null}
            {data.canApprove ? (
              <>
                <Button title="Approve estimate" variant="success" loading={act.isPending && act.variables === 'approve'} onPress={() => act.mutate('approve')} />
                <Button title="Decline and cancel" variant="ghost" onPress={() => act.mutate('cancel')} />
              </>
            ) : null}
            <AppText variant="caption">You pay the business directly when the work is done.</AppText>
          </Card>
        ) : null}

        {data.history.length > 0 ? (
          <Card style={styles.gap}>
            <AppText variant="subheading">Timeline</AppText>
            {data.history.map((entry) => (
              <View key={`${entry.status}-${entry.at}`} style={styles.row}>
                <AppText color={colors.ink} style={styles.flex}>
                  {REQUEST_STATUS_LABELS[entry.status]}
                </AppText>
                <AppText variant="small">{time(entry.at)}</AppText>
              </View>
            ))}
          </Card>
        ) : null}

        {data.canCancel && !data.canApprove ? (
          <Button
            title="Cancel request"
            variant="secondary"
            loading={act.isPending && act.variables === 'cancel'}
            onPress={() =>
              Alert.alert('Cancel this request?', undefined, [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel request', style: 'destructive', onPress: () => act.mutate('cancel') },
              ])
            }
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
});
