import { EVERY_DAY, WEEKDAYS, offerHeadline, type Redemption, type StudentOffer } from '@platform/contracts';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AppText, Button, Card, Icon, Sheet, useToast } from '@/components/ui';
import { distanceLabel } from '@/features/services/meta';
import { errorMessage } from '@/lib/errors';
import { engagementService } from '@/services/engagement.service';
import { colors, radius, space } from '@/theme/tokens';

export function daysText(mask: number): string {
  if (mask === EVERY_DAY) return 'Every day';
  return WEEKDAYS.filter((_, index) => (mask & (1 << index)) !== 0).join(', ');
}

function useSecondsLeft(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : 0;
}

/** The code a student shows at the counter: big, as a QR, with the time left. */
export function CodeSheet({ redemption, onClose }: { redemption: Redemption | null; onClose: () => void }) {
  const left = useSecondsLeft(redemption?.status === 'ISSUED' ? redemption.expiresAt : null);
  return (
    <Sheet visible={!!redemption} onClose={onClose} title={redemption?.offer.headline ?? 'Offer'}>
      {redemption ? (
        <View style={styles.sheet}>
          <AppText variant="subheading" align="center">
            {redemption.offer.title}
          </AppText>
          <AppText align="center">Show this at {redemption.place.name}</AppText>
          <View style={styles.codeBox}>
            <AppText style={styles.code}>{redemption.code}</AppText>
          </View>
          <QRCode value={redemption.code} size={150} color={colors.brand} />
          <AppText variant="small" align="center">
            {redemption.status === 'ISSUED'
              ? left > 0
                ? `Valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
                : 'Expired: get a new code'
              : redemption.status === 'REDEEMED'
                ? 'Already used'
                : 'Expired'}
          </AppText>
          <Button title="Done" variant="secondary" onPress={onClose} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** One student offer with a button that gets a counter code. */
export function OfferCard({ offer, showPlace = true, width }: { offer: StudentOffer; showPlace?: boolean; width?: number }) {
  const toast = useToast();
  const [code, setCode] = useState<Redemption | null>(null);
  const redeem = useMutation({
    mutationFn: () => engagementService.redeem(offer.id).then((r) => r.data),
    onSuccess: setCode,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const distance = distanceLabel(offer.distanceMeters);
  const limits = [
    daysText(offer.daysOfWeek),
    offer.minOrderAmount ? `min. ₹${offer.minOrderAmount}` : null,
    offer.limitPeriod === 'DAILY' ? `${offer.limitPerStudent}× a day` : offer.limitPerStudent > 1 ? `${offer.limitPerStudent}× each` : 'once each',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card style={[styles.card, width ? { width } : null]}>
      <View style={styles.row}>
        <View style={styles.headline}>
          <AppText variant="heading" color={colors.accent}>
            {offerHeadline(offer)}
          </AppText>
        </View>
        {distance ? (
          <View style={styles.row}>
            <Icon name="location-outline" size={13} color={colors.pin} />
            <AppText variant="caption">{distance}</AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="bodyStrong" color={colors.ink}>
        {offer.title}
      </AppText>
      {showPlace ? (
        <AppText
          variant="smallStrong"
          color={colors.action}
          onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: offer.place.slug } })}
        >
          {offer.place.name}
        </AppText>
      ) : null}
      <AppText variant="caption">{limits}</AppText>
      <Button title="Get code" icon="pricetag" size="sm" variant="success" loading={redeem.isPending} onPress={() => redeem.mutate()} />
      <CodeSheet redemption={code} onClose={() => setCode(null)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  headline: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  sheet: { alignItems: 'center', gap: space.md },
  codeBox: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: colors.subtle },
  code: { fontSize: 36, fontWeight: '800', letterSpacing: 8, color: colors.ink },
});
