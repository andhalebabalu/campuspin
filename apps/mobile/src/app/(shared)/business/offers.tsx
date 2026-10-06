import { EVERY_DAY, offerHeadline, type DiscountType, type OwnerOffer } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  Segmented,
  Sheet,
  TextField,
  useToast,
} from '@/components/ui';
import { PlaceSwitcher, usePlaceSelection } from '@/features/business/place-switcher';
import { daysText } from '@/features/offers/offer-card';
import { indiaDate } from '@/features/services/meta';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { engagementService } from '@/services/engagement.service';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Student offers on the phone: check a student's code at the counter, create an offer, pause or
 * resume one. The full offer form (days, limits, terms) is also on the web dashboard.
 */
export default function BusinessOffersScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const selection = usePlaceSelection();
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', type: 'PERCENT' as DiscountType, value: '10', minOrder: '' });

  const offers = useQuery({
    queryKey: ['business', 'offers'],
    queryFn: ({ signal }) => engagementService.ownerOffers(signal).then((r) => r.data),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['business', 'offers'] });

  const verify = useMutation({
    mutationFn: () => engagementService.verifyCode(code.trim().toUpperCase()).then((r) => r.data),
    onSuccess: (used) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setCode('');
      refresh();
      toast(`${used.offer.headline} for ${used.student.name}: give the discount now`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const create = useMutation({
    mutationFn: () =>
      engagementService.createOffer({
        placeId: selection.place!.id,
        title: draft.title.trim(),
        discountType: draft.type,
        discountValue: draft.type === 'FREEBIE' ? 0 : Math.round(Number(draft.value)),
        minOrderAmount: draft.minOrder ? Math.round(Number(draft.minOrder)) : null,
        validFrom: indiaDate(),
        daysOfWeek: EVERY_DAY,
        limitPerStudent: 1,
        limitPeriod: 'ONCE',
      }),
    onSuccess: () => {
      setCreating(false);
      setDraft({ title: '', type: 'PERCENT', value: '10', minOrder: '' });
      refresh();
      toast('Offer is live');
    },
  });
  const toggle = useMutation({
    mutationFn: (offer: OwnerOffer) => engagementService.updateOffer(offer.id, { status: offer.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }),
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Screen keyboard refreshing={offers.isRefetching} onRefresh={() => void offers.refetch()}>
      <Stack.Screen options={{ title: 'Offers' }} />
      <View style={styles.gap}>
        <Card style={styles.gap}>
          <AppText variant="subheading">Check a student’s code</AppText>
          <View style={styles.row}>
            <TextInput
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              placeholder="6-character code"
              placeholderTextColor={colors.placeholder}
              style={styles.codeInput}
            />
            <Button title="Use" variant="success" fullWidth={false} disabled={code.trim().length !== 6} loading={verify.isPending} onPress={() => verify.mutate()} />
          </View>
        </Card>

        <Button title="New offer" icon="add" onPress={() => setCreating(true)} disabled={!selection.place} />

        {offers.isPending ? (
          <ListSkeleton />
        ) : offers.isError ? (
          <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />
        ) : offers.data.length === 0 ? (
          <EmptyState icon="pricetag-outline" title="No offers yet" message="A student offer brings students in on quiet days." />
        ) : (
          offers.data.map((offer) => (
            <Card key={offer.id} style={styles.gapSm}>
              <View style={styles.row}>
                <AppText variant="heading" color={colors.accent} style={styles.flex}>
                  {offerHeadline(offer)}
                </AppText>
                <Badge label={offer.status.toLowerCase()} tint={offer.status === 'ACTIVE' ? 'green' : offer.status === 'REMOVED' ? 'rose' : 'slate'} />
              </View>
              <AppText variant="bodyStrong" color={colors.ink}>
                {offer.title}
              </AppText>
              <AppText variant="small">
                {offer.place.name} · {daysText(offer.daysOfWeek)} · used {offer.redeemedCount}
                {offer.totalLimit ? ` of ${offer.totalLimit}` : ''}
              </AppText>
              {offer.removedReason ? (
                <AppText variant="small" color={colors.danger}>
                  Taken down: {offer.removedReason}
                </AppText>
              ) : null}
              {offer.status === 'ACTIVE' || offer.status === 'PAUSED' ? (
                <Button title={offer.status === 'ACTIVE' ? 'Pause' : 'Resume'} size="sm" variant="outline" fullWidth={false} onPress={() => toggle.mutate(offer)} />
              ) : null}
            </Card>
          ))
        )}
      </View>

      <Sheet visible={creating} onClose={() => setCreating(false)} title="New student offer">
        <View style={styles.gap}>
          <PlaceSwitcher {...selection} />
          <TextField label="Title" value={draft.title} maxLength={80} placeholder="10% off for CampusPin students" onChangeText={(title) => setDraft({ ...draft, title })} />
          <Segmented
            options={[
              { value: 'PERCENT', label: '% off' },
              { value: 'FLAT', label: '₹ off' },
              { value: 'FREEBIE', label: 'Free item' },
            ]}
            value={draft.type}
            onChange={(type) => setDraft({ ...draft, type })}
          />
          {draft.type !== 'FREEBIE' ? (
            <TextField label={draft.type === 'PERCENT' ? 'Percent' : 'Rupees'} keyboardType="number-pad" value={draft.value} onChangeText={(value) => setDraft({ ...draft, value: value.replace(/\D/g, '') })} />
          ) : null}
          <TextField label="Minimum order ₹ (optional)" keyboardType="number-pad" value={draft.minOrder} onChangeText={(minOrder) => setDraft({ ...draft, minOrder: minOrder.replace(/\D/g, '') })} />
          <AppText variant="caption">Starts today, every day, once per student. Set end dates and limits on the web dashboard.</AppText>
          {create.isError ? (
            <AppText variant="small" color={colors.danger}>
              {Object.values(serverFieldErrors(create.error)).join(' ') || errorMessage(create.error)}
            </AppText>
          ) : null}
          <Button title="Publish offer" variant="success" loading={create.isPending} disabled={!draft.title.trim()} onPress={() => create.mutate()} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  codeInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.ink,
  },
});
