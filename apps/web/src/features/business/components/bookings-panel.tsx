'use client';

import { ApiClientError } from '@platform/api-client';
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  type BusinessBooking,
  type BusinessListing,
  type PlaceService,
  type ScheduleWindow,
  type ServiceItem,
} from '@platform/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { bookingTone, bookingWhen } from '@/features/bookings/components/my-bookings';
import { rupees } from '@/features/orders/lib/use-cart';
import { bookingsService } from '@/services/bookings.service';
import { ordersService } from '@/services/orders.service';
import { servicesService } from '@/services/services.service';
import { PlacePicker } from './place-picker';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const INPUT = 'h-10 rounded-md border border-control bg-surface px-3 text-sm';
const ACTION: Partial<Record<BookingStatus, string>> = {
  CONFIRMED: 'Confirm',
  COMPLETED: 'Done',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancel',
};

function BookingList() {
  const toast = useToast();
  const [scope, setScope] = useState<'upcoming' | 'today' | 'all'>('upcoming');
  const [loaded, setLoaded] = useState<{ scope: string; items: BusinessBooking[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = loaded?.scope === scope ? loaded.items : null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await bookingsService.businessList({ scope }, signal);
        setLoaded({ scope, items: result.data });
        setError(null);
      } catch (caught) {
        if (!signal?.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load bookings.');
      }
    },
    [scope],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  async function move(booking: BusinessBooking, status: BookingStatus) {
    let reason: string | undefined;
    if (status === 'CANCELLED') {
      const answer = window.prompt('Tell the student why (optional):', '');
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    try {
      const result = await bookingsService.updateStatus(booking.id, status, reason);
      setLoaded((state) =>
        state
          ? {
              ...state,
              items: state.items.map((item) => (item.id === booking.id ? result.data : item)),
            }
          : state,
      );
      toast.show(`${booking.code}: ${BOOKING_STATUS_LABELS[status]}`);
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not update.', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(['upcoming', 'today', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize ${scope === value ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-line text-body hover:bg-subtle'}`}
          >
            {value}
          </button>
        ))}
      </div>
      {error && !items ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No bookings" description="Bookings appear here as students make them." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((booking) => (
            <li key={booking.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-ink">
                    {booking.itemName} · {bookingWhen(booking)}
                  </p>
                  <p className="text-sm text-body">
                    {booking.student.name} · seat {booking.seatNo} · {rupees(booking.price)} ·{' '}
                    {booking.code}
                  </p>
                  {booking.note && <p className="text-sm text-muted">Note: {booking.note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={bookingTone(booking)}>{booking.statusLabel}</Badge>
                  {booking.nextStatuses.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={
                        status === 'CONFIRMED' || status === 'COMPLETED' ? 'primary' : 'ghost'
                      }
                      onClick={() => void move(booking, status)}
                    >
                      {ACTION[status] ?? status}
                    </Button>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingSetup({ listings }: { listings: BusinessListing[] }) {
  const toast = useToast();
  const [placeId, setPlaceId] = useState('');
  const [services, setServices] = useState<{ placeId: string; list: PlaceService[] } | null>(null);
  const [serviceKey, setServiceKey] = useState('');
  const [windows, setWindows] = useState<ScheduleWindow[] | null>(null);
  const [items, setItems] = useState<ServiceItem[] | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    price: '',
    duration: '30',
    wholeDay: false,
    capacity: '1',
  });

  const bookable =
    services?.placeId === placeId
      ? services.list.filter((service) => service.serviceType.kind === 'BOOKING' && service.enabled)
      : null;
  const activeKey = bookable?.some((service) => service.serviceType.key === serviceKey)
    ? serviceKey
    : (bookable?.[0]?.serviceType.key ?? '');

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    servicesService
      .ownerServices(placeId, controller.signal)
      .then((result) => setServices({ placeId, list: result.data }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [placeId]);

  useEffect(() => {
    if (!placeId || !activeKey) return;
    const controller = new AbortController();
    Promise.all([
      bookingsService.schedule(placeId, activeKey, controller.signal),
      ordersService.items(placeId, activeKey, controller.signal),
    ])
      .then(([schedule, list]) => {
        setWindows(schedule.data);
        setItems(list.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [placeId, activeKey]);

  async function saveWindows(next: ScheduleWindow[]) {
    try {
      const result = await bookingsService.saveSchedule(placeId, activeKey, { windows: next });
      setWindows(result.data);
      toast.show('Opening hours saved');
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not save.', 'error');
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await ordersService.addItem(placeId, {
        serviceKey: activeKey,
        section: '',
        name: draft.name.trim(),
        price: Math.round(Number(draft.price) || 0),
        options: [],
        available: true,
        sortOrder: items?.length ?? 0,
        durationMinutes: draft.wholeDay ? null : Math.round(Number(draft.duration) || 30),
        capacity: Math.max(1, Math.round(Number(draft.capacity) || 1)),
      });
      setItems((list) => [...(list ?? []), result.data]);
      setDraft({ name: '', price: '', duration: '30', wholeDay: false, capacity: '1' });
      toast.show('Added');
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not add.', 'error');
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-ink">Booking setup</p>
        <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
      </div>
      {!bookable ? (
        <Skeleton className="h-24 w-full" />
      ) : bookable.length === 0 ? (
        <p className="text-sm text-muted">
          Switch on Book Appointment or Study Space under Services (with “Take bookings” on) to set
          up bookings.
        </p>
      ) : (
        <>
          {bookable.length > 1 && (
            <div className="flex gap-2">
              {bookable.map((service) => (
                <button
                  key={service.serviceType.key}
                  type="button"
                  aria-pressed={activeKey === service.serviceType.key}
                  onClick={() => setServiceKey(service.serviceType.key)}
                  className={`rounded-full border px-3 py-1 text-sm ${activeKey === service.serviceType.key ? 'border-primary-700 bg-primary-50' : 'border-line'}`}
                >
                  {service.serviceType.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Opening hours (India time)</p>
            {!windows ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {DAYS.map((label, index) => {
                  const day = index + 1;
                  const current = windows.find((window) => window.dayOfWeek === day);
                  return (
                    <li key={label} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-10 font-medium text-ink">{label}</span>
                      {current ? (
                        <>
                          <input
                            type="time"
                            aria-label={`${label} opens`}
                            value={current.openTime}
                            onChange={(event) =>
                              setWindows(
                                windows.map((window) =>
                                  window.dayOfWeek === day
                                    ? { ...window, openTime: event.target.value }
                                    : window,
                                ),
                              )
                            }
                            className={INPUT}
                          />
                          <span>to</span>
                          <input
                            type="time"
                            aria-label={`${label} closes`}
                            value={current.closeTime}
                            onChange={(event) =>
                              setWindows(
                                windows.map((window) =>
                                  window.dayOfWeek === day
                                    ? { ...window, closeTime: event.target.value }
                                    : window,
                                ),
                              )
                            }
                            className={INPUT}
                          />
                          <button
                            type="button"
                            className="text-muted hover:text-danger-700"
                            onClick={() =>
                              setWindows(windows.filter((window) => window.dayOfWeek !== day))
                            }
                          >
                            Closed
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="text-primary-700"
                          onClick={() =>
                            setWindows([
                              ...windows,
                              { dayOfWeek: day, openTime: '09:00', closeTime: '18:00' },
                            ])
                          }
                        >
                          + Open this day
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {windows && (
              <Button size="sm" className="self-start" onClick={() => void saveWindows(windows)}>
                Save hours
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">What students can book</p>
            <ul className="flex flex-col gap-1 text-sm">
              {(items ?? []).map((item) => (
                <li key={item.id} className="text-body">
                  <span className="font-medium text-ink">{item.name}</span> · {rupees(item.price)} ·{' '}
                  {item.durationMinutes === null ? 'whole day' : `${item.durationMinutes} min`} ·{' '}
                  {item.capacity ?? 1} per slot
                </li>
              ))}
            </ul>
            <form
              onSubmit={(event) => void addItem(event)}
              className="flex flex-wrap items-end gap-2"
            >
              <input
                required
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. Haircut, Day seat"
                aria-label="Name"
                className={INPUT}
              />
              <input
                required
                type="number"
                min={0}
                value={draft.price}
                onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                placeholder="Price ₹"
                aria-label="Price"
                className={`${INPUT} w-24`}
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={draft.wholeDay}
                  onChange={(event) => setDraft({ ...draft, wholeDay: event.target.checked })}
                />{' '}
                Whole day
              </label>
              {!draft.wholeDay && (
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={draft.duration}
                  onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                  aria-label="Minutes per slot"
                  className={`${INPUT} w-24`}
                />
              )}
              <input
                type="number"
                min={1}
                value={draft.capacity}
                onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
                aria-label="Bookings per slot"
                title="Bookings per slot (seats, chairs)"
                className={`${INPUT} w-20`}
              />
              <Button type="submit" size="sm" variant="secondary">
                <Icon name="plus" className="size-4" /> Add
              </Button>
            </form>
          </div>
        </>
      )}
    </Card>
  );
}

/** Bookings: the list with confirm / done / no-show, and the setup (hours and bookable items). */
export function BookingsPanel({ listings }: { listings: BusinessListing[] }) {
  if (listings.length === 0)
    return (
      <EmptyState
        title="Add a listing first"
        description="Bookings belong to one of your listings."
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <BookingList />
      <BookingSetup listings={listings} />
    </div>
  );
}
