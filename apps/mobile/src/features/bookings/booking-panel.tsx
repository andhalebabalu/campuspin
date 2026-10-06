import type { Booking, BookingConfig, PublicPlaceService, ServiceItem } from '@platform/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Badge, Button, Card, Chip, Icon, Skeleton, useToast } from '@/components/ui';
import { newIdempotencyKey, rupees } from '@/features/orders/cart';
import { dayLabel, indiaDate } from '@/features/services/meta';
import { errorMessage } from '@/lib/errors';
import { bookingsService } from '@/services/bookings.service';
import type { Tint } from '@/theme/tokens';
import { colors, radius, space } from '@/theme/tokens';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function bookingWhen(booking: Pick<Booking, 'startAt' | 'wholeDay'>): string {
  const start = new Date(booking.startAt);
  const date = start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return booking.wholeDay ? `${date} · all day` : `${date} · ${timeOf(booking.startAt)}`;
}

export function bookingTint(status: Booking['status']): Tint {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'CANCELLED' || status === 'NO_SHOW') return 'rose';
  if (status === 'COMPLETED') return 'slate';
  return 'amber';
}

export function BookingCard({ booking, onCancel }: { booking: Booking; onCancel?: () => void }) {
  return (
    <Card style={styles.card}>
      <View style={styles.icon}>
        <Icon name="calendar-outline" size={22} color={colors.brand} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={colors.ink} numberOfLines={1}>
          {booking.itemName} · {booking.place.name}
        </AppText>
        <AppText variant="small">{bookingWhen(booking)} · {rupees(booking.price)}</AppText>
        {booking.cancellable && onCancel ? (
          <AppText variant="smallStrong" color={colors.danger} onPress={onCancel}>
            Cancel
          </AppText>
        ) : null}
      </View>
      <Badge label={booking.statusLabel} tint={bookingTint(booking.status)} />
    </Card>
  );
}

/** A bookable service on a place: details, and item → day → time → book when bookings are on. */
export function BookingPanel({ slug, service, items }: { slug: string; service: PublicPlaceService; items: ServiceItem[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const config = service.config as BookingConfig;
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [date, setDate] = useState(indiaDate());
  const [startAt, setStartAt] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const availability = useQuery({
    queryKey: ['availability', slug, itemId, date],
    enabled: config.bookingEnabled && !!itemId,
    queryFn: ({ signal }) => bookingsService.availability(slug, itemId, date, signal).then((r) => r.data),
  });
  const book = useMutation({
    mutationFn: () => {
      key.current ??= newIdempotencyKey();
      return bookingsService.book({ itemId, startAt: startAt!, idempotencyKey: key.current }).then((r) => r.data);
    },
    onSuccess: (booking) => {
      key.current = null;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast(booking.status === 'CONFIRMED' ? 'Booked and confirmed' : 'Booked: waiting for confirmation');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      router.navigate('/orders');
    },
    onError: (error) => {
      key.current = null;
      setStartAt(null);
      void availability.refetch();
      toast(errorMessage(error), 'error');
    },
  });
  const details = [
    config.seats ? `${config.seats} seats` : null,
    config.pricePerDay !== null ? `${rupees(config.pricePerDay)} a day` : null,
    config.facilities.length ? config.facilities.join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const days = Array.from({ length: 7 }, (_, index) => indiaDate(index));

  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <Icon name="calendar-outline" size={20} color={colors.brand} />
        <AppText variant="subheading">{service.name}</AppText>
      </View>
      {details || service.description ? <AppText variant="small">{details || service.description}</AppText> : null}
      {!config.bookingEnabled ? (
        <AppText variant="small">Walk in or book in person: no CampusPin bookings here.</AppText>
      ) : items.length === 0 ? (
        <AppText variant="small">Bookings open soon.</AppText>
      ) : (
        <>
          {items.length > 1 ? (
            <View style={styles.wrap}>
              {items.map((item) => (
                <Chip key={item.id} label={`${item.name} · ${rupees(item.price)}`} selected={itemId === item.id} onPress={() => { setItemId(item.id); setStartAt(null); }} />
              ))}
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((day) => (
              <Chip key={day} label={dayLabel(day)} selected={date === day} onPress={() => { setDate(day); setStartAt(null); }} />
            ))}
          </ScrollView>
          {availability.isPending ? (
            <Skeleton height={60} rounded={radius.md} />
          ) : availability.isError ? (
            <AppText color={colors.danger}>{errorMessage(availability.error)}</AppText>
          ) : availability.data.slots.length === 0 ? (
            <AppText variant="small">Closed or nothing left on {dayLabel(date)}.</AppText>
          ) : (
            <View style={styles.wrap}>
              {availability.data.slots.map((slot) => {
                const full = slot.remaining === 0;
                const on = startAt === slot.startAt;
                return (
                  <Pressable
                    key={slot.startAt}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: full }}
                    disabled={full}
                    onPress={() => setStartAt(slot.startAt)}
                    style={[styles.slot, on && styles.slotOn, full && styles.slotFull]}
                  >
                    <AppText variant="smallStrong" color={on ? colors.accent : colors.ink}>
                      {availability.data.item.durationMinutes === null ? 'All day' : timeOf(slot.startAt)}
                    </AppText>
                    <AppText variant="caption">{full ? 'Full' : `${slot.remaining} left`}</AppText>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Button title="Book" variant="success" icon="checkmark" disabled={!startAt} loading={book.isPending} onPress={() => book.mutate()} />
          <AppText variant="caption">Pay at the place. {config.autoConfirm ? 'Confirmed at once.' : 'The place confirms your booking.'}</AppText>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  days: { gap: space.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  slot: { minWidth: 88, alignItems: 'center', paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  slotOn: { borderColor: colors.go, backgroundColor: colors.accentSoft },
  slotFull: { opacity: 0.4 },
});
