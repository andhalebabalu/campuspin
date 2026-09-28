'use client';

import { ApiClientError } from '@platform/api-client';
import {
  MEAL_LABELS,
  MEAL_SLOTS,
  MENU_ITEMS_PER_MEAL_MAX,
  type BusinessListing,
  type MealSlot,
  type Meals,
  type OwnerDailyMenu,
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
import { dayLabel, indiaDate } from '@/features/services/lib/service-meta';
import { servicesService } from '@/services/services.service';
import { NotLiveNote, PlacePicker } from './place-picker';

const EMPTY_MEALS: Meals = { BREAKFAST: [], LUNCH: [], SNACKS: [], DINNER: [] };

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function StatusBadge({ menu }: { menu: OwnerDailyMenu | undefined }) {
  if (!menu) return <Badge>Not started</Badge>;
  if (menu.status === 'PUBLISHED') return <Badge tone="success">Published</Badge>;
  if (menu.status === 'REMOVED') return <Badge tone="danger">Removed by CampusPin</Badge>;
  return <Badge tone="accent">Draft</Badge>;
}

function MealEditor({
  meal,
  dishes,
  onChange,
}: {
  meal: MealSlot;
  dishes: string[];
  onChange: (dishes: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const full = dishes.length >= MENU_ITEMS_PER_MEAL_MAX;

  function add(event: FormEvent) {
    event.preventDefault();
    const names = draft
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const known = new Set(dishes.map((dish) => dish.toLowerCase()));
    onChange(
      [...dishes, ...names.filter((name) => !known.has(name.toLowerCase()))].slice(
        0,
        MENU_ITEMS_PER_MEAL_MAX,
      ),
    );
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <p className="font-semibold text-ink">{MEAL_LABELS[meal]}</p>
      {dishes.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {dishes.map((dish, index) => (
            <li
              key={`${dish}-${index}`}
              className="flex items-center gap-1 rounded-full bg-subtle py-1 pr-1 pl-3 text-sm text-ink"
            >
              {dish}
              <button
                type="button"
                onClick={() => onChange(dishes.filter((_, at) => at !== index))}
                className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-neutral-200 hover:text-ink"
              >
                <Icon name="close" className="size-3.5" label={`Remove ${dish}`} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No dishes yet.</p>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor={`dish-${meal}`} className="sr-only">
          Add a dish to {MEAL_LABELS[meal]}
        </label>
        <input
          id={`dish-${meal}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={full}
          maxLength={200}
          placeholder={full ? 'This meal is full' : 'e.g. Dal, Rice'}
          className="h-10 flex-1 rounded-md border border-control bg-surface px-3 text-sm"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={full || !draft.trim()}>
          <Icon name="plus" className="size-4" /> Add item
        </Button>
      </form>
    </div>
  );
}

/**
 * The mess owner's daily menu: pick a day, add dishes per meal, save a draft or publish. Copying
 * yesterday's menu or today's to tomorrow is one click, because most days change little.
 */
export function DailyMenuPanel({ listings }: { listings: BusinessListing[] }) {
  const toast = useToast();
  const today = indiaDate();
  const [placeId, setPlaceId] = useState('');
  const [date, setDate] = useState(today);
  const [menus, setMenus] = useState<OwnerDailyMenu[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const current = menus?.find((menu) => menu.date === date);

  // Unsaved edits belong to one day's saved version: switching day (or saving) starts from what is stored.
  const editKey = `${placeId}|${date}|${current?.updatedAt ?? 'new'}`;
  const [draft, setDraft] = useState<{ key: string; meals: Meals; note: string } | null>(null);
  const meals = draft?.key === editKey ? draft.meals : (current?.meals ?? EMPTY_MEALS);
  const note = draft?.key === editKey ? draft.note : (current?.note ?? '');
  const setMeals = (update: (currentMeals: Meals) => Meals) =>
    setDraft({ key: editKey, meals: update(meals), note });
  const setNote = (value: string) => setDraft({ key: editKey, meals, note: value });

  const load = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    servicesService
      .ownerMenus(
        placeId,
        { from: shiftDate(today, -14), to: shiftDate(today, 14) },
        controller.signal,
      )
      .then((result) => {
        setMenus(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your menus.' },
        );
      });
    return () => controller.abort();
  }, [placeId, today, reload]);

  const dishCount = MEAL_SLOTS.reduce((sum, meal) => sum + meals[meal].length, 0);
  const dirty =
    JSON.stringify(meals) !== JSON.stringify(current?.meals ?? EMPTY_MEALS) ||
    note !== (current?.note ?? '');

  function replaceMenu(saved: OwnerDailyMenu) {
    setMenus((list) =>
      [saved, ...(list ?? []).filter((menu) => menu.date !== saved.date)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    );
  }

  async function run(label: string, action: () => Promise<OwnerDailyMenu | null>, success: string) {
    setBusy(label);
    setActionError(null);
    try {
      const saved = await action();
      if (saved) replaceMenu(saved);
      toast.show(success);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setActionError(fields ? Object.values(fields).flat().join(' ') : caught.message);
      } else setActionError('Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const save = (publish: boolean) =>
    run(
      publish ? 'publish' : 'save',
      async () =>
        (
          await servicesService.saveMenu(placeId, date, {
            meals,
            note: note.trim() || null,
            publish,
          })
        ).data,
      publish
        ? `Menu for ${dayLabel(date)} published`
        : current?.status === 'PUBLISHED'
          ? 'Changes published'
          : 'Draft saved',
    );

  const copyFrom = (fromDate: string) => {
    if (
      dishCount > 0 &&
      !window.confirm(`Replace the dishes for ${dayLabel(date)} with ${dayLabel(fromDate)}'s?`)
    )
      return;
    void run(
      'copy',
      async () => (await servicesService.copyMenu(placeId, date, fromDate)).data,
      `Copied ${dayLabel(fromDate)}'s menu`,
    );
  };

  const copyToNext = () => {
    const next = shiftDate(date, 1);
    void run(
      'copy-next',
      async () => (await servicesService.copyMenu(placeId, next, date)).data,
      `Copied to ${dayLabel(next)}. Publish it from there.`,
    );
  };

  const remove = () => {
    if (!window.confirm(`Delete the menu for ${dayLabel(date)}?`)) return;
    void run(
      'delete',
      async () => {
        await servicesService.deleteMenu(placeId, date);
        setMenus((list) => (list ?? []).filter((menu) => menu.date !== date));
        return null;
      },
      'Menu deleted',
    );
  };

  if (listings.length === 0) {
    return (
      <EmptyState title="Add your mess first" description="Menus belong to one of your listings." />
    );
  }

  const days = [
    { date: shiftDate(today, -1), label: 'Yesterday' },
    { date: today, label: 'Today' },
    { date: shiftDate(today, 1), label: 'Tomorrow' },
  ];
  const statusOf = (day: string) => menus?.find((menu) => menu.date === day);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-md">
          {[
            { label: "Today's menu", menu: statusOf(today) },
            { label: "Tomorrow's menu", menu: statusOf(shiftDate(today, 1)) },
          ].map((card) => (
            <Card key={card.label} className="flex flex-col gap-1.5 p-4">
              <span className="text-sm text-body">{card.label}</span>
              <StatusBadge menu={card.menu} />
            </Card>
          ))}
        </div>
        <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
      </div>
      <NotLiveNote listing={listings.find((listing) => listing.id === placeId)} />

      {error ? (
        <ErrorState message={error.message} requestId={error.requestId} onRetry={load} />
      ) : !menus ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <Card className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => {
                      setDate(day.date);
                      setActionError(null);
                    }}
                    aria-pressed={date === day.date}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                      date === day.date
                        ? 'border-primary-700 bg-primary-50 text-primary-800'
                        : 'border-line text-body hover:bg-subtle'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
                <label className="flex items-center gap-2 text-sm text-body">
                  <span className="sr-only">Another day</span>
                  <input
                    type="date"
                    value={date}
                    min={shiftDate(today, -7)}
                    max={shiftDate(today, 14)}
                    onChange={(event) => event.target.value && setDate(event.target.value)}
                    className="h-9 rounded-md border border-control bg-surface px-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{dayLabel(date)}</span>
                <StatusBadge menu={current} />
              </div>
            </div>

            {current?.status === 'REMOVED' && (
              <p className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
                The CampusPin team took this menu down
                {current.removedReason ? `: ${current.removedReason}` : '.'} Edit it and publish
                again.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={busy === 'copy'}
                onClick={() => copyFrom(shiftDate(date, -1))}
              >
                <Icon name="copy" className="size-4" /> Copy{' '}
                {date === today ? "yesterday's" : 'previous day'} menu
              </Button>
              {current && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === 'copy-next'}
                  onClick={copyToNext}
                >
                  <Icon name="copy" className="size-4" /> Copy to{' '}
                  {date === today ? 'tomorrow' : 'next day'}
                </Button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {MEAL_SLOTS.map((meal) => (
                <MealEditor
                  key={meal}
                  meal={meal}
                  dishes={meals[meal]}
                  onChange={(dishes) =>
                    setMeals((currentMeals) => ({ ...currentMeals, [meal]: dishes }))
                  }
                />
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="menu-note" className="text-sm font-medium text-ink">
                Note for students <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="menu-note"
                value={note}
                maxLength={255}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Special: Gulab jamun at dinner"
                className="h-10 rounded-md border border-control bg-surface px-3 text-sm"
              />
            </div>

            {actionError && (
              <p className="text-sm text-danger-700" role="alert">
                {actionError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              {current?.status === 'PUBLISHED' ? (
                <>
                  <Button
                    loading={busy === 'save'}
                    disabled={!dirty || dishCount === 0}
                    onClick={() => void save(false)}
                  >
                    Publish changes
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy === 'unpublish'}
                    onClick={() =>
                      void run(
                        'unpublish',
                        async () => (await servicesService.unpublishMenu(placeId, date)).data,
                        'Menu hidden from students',
                      )
                    }
                  >
                    Unpublish
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    loading={busy === 'publish'}
                    disabled={dishCount === 0}
                    onClick={() => void save(true)}
                  >
                    Publish{' '}
                    {date === today
                      ? "today's"
                      : date === shiftDate(today, 1)
                        ? "tomorrow's"
                        : 'this'}{' '}
                    menu
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy === 'save'}
                    disabled={!dirty || dishCount === 0}
                    onClick={() => void save(false)}
                  >
                    Save draft
                  </Button>
                </>
              )}
              {current && (
                <Button variant="ghost" loading={busy === 'delete'} onClick={remove}>
                  <Icon name="trash" className="size-4" /> Delete
                </Button>
              )}
            </div>
          </Card>

          <Card className="flex h-fit flex-col gap-3 p-5">
            <p className="font-semibold text-ink">Menu history</p>
            {menus.length === 0 ? (
              <p className="text-sm text-muted">Your published menus will show here.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {menus.map((menu) => (
                  <li key={menu.id}>
                    <button
                      type="button"
                      onClick={() => setDate(menu.date)}
                      className={`flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm ${
                        menu.date === date ? 'font-semibold text-primary-800' : 'text-ink'
                      }`}
                    >
                      {dayLabel(menu.date)}
                      <StatusBadge menu={menu} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
