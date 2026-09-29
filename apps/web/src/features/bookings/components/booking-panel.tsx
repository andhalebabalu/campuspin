'use client';

import { ApiClientError } from '@platform/api-client';
import {
  BOOKING_DAYS_AHEAD,
  type Availability,
  type BookingConfig,
  type PublicPlaceService,
  type ServiceItem,
} from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { rupees } from '@/features/orders/lib/use-cart';
import { dayLabel, indiaDate } from '@/features/services/lib/service-meta';
import { useSession } from '@/lib/auth/session-context';
import { bookingsService } from '@/services/bookings.service';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/**
 * A bookable service on a place page: details (seats, price, facilities) and, when the business
 * takes bookings through CampusPin, item → day → time → confirm.
 */
export function BookingPanel({
  placeSlug,
  service,
  items,
}: {
  placeSlug: string;
  service: PublicPlaceService;
  items: ServiceItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { status } = useSession();
  const config = service.config as BookingConfig;
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [date, setDate] = useState(indiaDate());
  const [loaded, setLoaded] = useState<{
    key: string;
    data: Availability | null;
    error?: string;
  } | null>(null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const key = `${itemId}|${date}`;
  const availability = loaded?.key === key ? loaded : null;

  useEffect(() => {
    if (!config.bookingEnabled || !itemId) return;
    const controller = new AbortController();
    bookingsService
      .availability(placeSlug, itemId, date, controller.signal)
      .then((result) => setLoaded({ key, data: result.data }))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({
            key,
            data: null,
            error: caught instanceof ApiClientError ? caught.message : 'Could not load times.',
          });
        }
      });
    return () => controller.abort();
  }, [config.bookingEnabled, placeSlug, itemId, date, key]);

  async function confirm() {
    if (!startAt) return;
    setBusy(true);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const result = await bookingsService.book({
        itemId,
        startAt,
        idempotencyKey: idempotencyKey.current,
      });
      toast.show(
        result.data.status === 'CONFIRMED'
          ? 'Booked and confirmed'
          : 'Booked: waiting for confirmation',
      );
      router.push(ROUTES.orders);
    } catch (caught) {
      idempotencyKey.current = null;
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not book.', 'error');
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }

  const days = Array.from({ length: Math.min(7, BOOKING_DAYS_AHEAD) }, (_, index) =>
    indiaDate(index),
  );

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Icon name="calendar" className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-ink">{service.name}</p>
          <p className="text-sm text-body">
            {[
              config.seats ? `${config.seats} seats` : null,
              config.pricePerDay !== null ? `${rupees(config.pricePerDay)} a day` : null,
              config.facilities.length ? config.facilities.join(', ') : null,
            ]
              .filter(Boolean)
              .join(' · ') || service.description}
          </p>
        </div>
      </div>

      {!config.bookingEnabled ? (
        <p className="text-sm text-muted">
          Walk in or book in person: this place does not take bookings on CampusPin.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Bookings open soon.</p>
      ) : (
        <>
          {items.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={itemId === item.id}
                  onClick={() => {
                    setItemId(item.id);
                    setStartAt(null);
                  }}
                  className={`rounded-full border px-4 py-1.5 text-sm ${itemId === item.id ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-line text-body'}`}
                >
                  {item.name} · {rupees(item.price)}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Day">
            {days.map((day) => (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={date === day}
                onClick={() => {
                  setDate(day);
                  setStartAt(null);
                }}
                className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${date === day ? 'border-primary-700 bg-primary-50 font-semibold text-primary-800' : 'border-line text-body'}`}
              >
                {dayLabel(day)}
              </button>
            ))}
          </div>
          {!availability ? (
            <Skeleton className="h-20 w-full" />
          ) : availability.error ? (
            <p className="text-sm text-danger-700">{availability.error}</p>
          ) : availability.data && availability.data.slots.length === 0 ? (
            <p className="text-sm text-muted">Closed or no times left on {dayLabel(date)}.</p>
          ) : availability.data ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {availability.data.slots.map((slot) => {
                const full = slot.remaining === 0;
                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    disabled={full}
                    aria-pressed={startAt === slot.startAt}
                    onClick={() => setStartAt(slot.startAt)}
                    className={`rounded-lg border px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${startAt === slot.startAt ? 'border-accent-600 bg-accent-50 font-semibold text-accent-700' : 'border-line text-ink'}`}
                  >
                    {availability.data?.item.durationMinutes === null
                      ? 'All day'
                      : timeOf(slot.startAt)}
                    <span className="block text-xs text-muted">
                      {full ? 'Full' : `${slot.remaining} left`}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {status === 'authenticated' ? (
            <Button
              className="self-start"
              disabled={!startAt}
              loading={busy}
              onClick={() => void confirm()}
            >
              Book{' '}
              {startAt && availability?.data?.item.durationMinutes !== null
                ? `for ${timeOf(startAt)}`
                : 'this day'}
            </Button>
          ) : (
            <Link
              href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
              className="text-sm font-semibold text-primary-700"
            >
              Sign in to book
            </Link>
          )}
          <p className="text-xs text-muted">
            Pay at the place.{' '}
            {config.autoConfirm ? 'Confirmed at once.' : 'The place confirms your booking.'}
          </p>
        </>
      )}
    </Card>
  );
}
