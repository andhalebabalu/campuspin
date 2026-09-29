'use client';

import { ApiClientError } from '@platform/api-client';
import type { Booking } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { rupees } from '@/features/orders/lib/use-cart';
import { bookingsService } from '@/services/bookings.service';

export function bookingTone(booking: Pick<Booking, 'status'>): BadgeTone {
  if (booking.status === 'CONFIRMED') return 'success';
  if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') return 'danger';
  if (booking.status === 'COMPLETED') return 'neutral';
  return 'accent';
}

export function bookingWhen(booking: Pick<Booking, 'startAt' | 'wholeDay'>): string {
  const start = new Date(booking.startAt);
  const date = start.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return booking.wholeDay
    ? `${date} · all day`
    : `${date} · ${start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`;
}

export function BookingCard({ booking, onCancel }: { booking: Booking; onCancel?: () => void }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-semibold text-ink">
          {booking.itemName} ·{' '}
          <Link href={ROUTES.placeDetail(booking.place.slug)} className="hover:text-primary-800">
            {booking.place.name}
          </Link>
        </p>
        <p className="text-sm text-body">
          {bookingWhen(booking)} · {rupees(booking.price)} · {booking.code}
        </p>
        {booking.statusReason && <p className="text-xs text-muted">{booking.statusReason}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={bookingTone(booking)}>{booking.statusLabel}</Badge>
        {booking.cancellable && onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

/** The student's bookings, upcoming first, with cancel. */
export function MyBookingsList() {
  const toast = useToast();
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    bookingsService
      .mine({}, controller.signal)
      .then((result) => {
        setItems(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load bookings.');
      });
    return () => controller.abort();
  }, [reload]);

  async function cancel(booking: Booking) {
    if (!window.confirm(`Cancel ${booking.itemName}, ${bookingWhen(booking)}?`)) return;
    try {
      const result = await bookingsService.cancel(booking.id);
      setItems(
        (list) => list?.map((item) => (item.id === booking.id ? result.data : item)) ?? null,
      );
      toast.show('Booking cancelled');
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not cancel.', 'error');
    }
  }

  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!items) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No bookings yet"
        description="Book a salon slot, a study seat or an appointment from a place page."
        action={
          <Link
            href={ROUTES.serviceType('APPOINTMENT')}
            className="text-sm font-semibold text-primary-700"
          >
            Find places
          </Link>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((booking) => (
        <li key={booking.id}>
          <BookingCard booking={booking} onCancel={() => void cancel(booking)} />
        </li>
      ))}
    </ul>
  );
}
