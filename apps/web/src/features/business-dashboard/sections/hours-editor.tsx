'use client';

import { ApiClientError } from '@platform/api-client';
import type { OwnedPlace, PlaceHourInput } from '@platform/contracts';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { DAY_NAMES } from '@/features/business-page/lib/open-status';
import { businessService } from '@/services/business.service';
import { PlaceScope } from '../place-scope';
import { SaveBar, useLeaveGuard } from '../unsaved';
import { Panel } from './overview';

type Mode = 'open' | 'closed' | '24h' | 'unset';
interface Slot {
  open: string;
  close: string;
  label: string;
}
interface Day {
  mode: Mode;
  slots: Slot[];
}

const MAX_SLOTS = 3;
const TIME_INPUT = 'h-10 rounded-lg border border-control bg-surface px-2.5 text-sm text-ink';

function daysOf(place: OwnedPlace): Day[] {
  return DAY_NAMES.map((_, index) => {
    const rows = place.hours
      .filter((hour) => hour.dayOfWeek === index + 1)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (rows.length === 0) return { mode: 'unset', slots: [] };
    if (rows.some((row) => row.isClosed)) return { mode: 'closed', slots: [] };
    if (rows.some((row) => row.is24Hours)) return { mode: '24h', slots: [] };
    return {
      mode: 'open',
      slots: rows.map((row) => ({
        open: row.openTime ?? '',
        close: row.closeTime ?? '',
        label: row.slotLabel ?? '',
      })),
    };
  });
}

/** The rows the API takes; null with a message when a slot is incomplete. */
function toRows(days: Day[]): { rows: PlaceHourInput[] } | { error: string } {
  const rows: PlaceHourInput[] = [];
  for (const [index, day] of days.entries()) {
    const dayOfWeek = index + 1;
    if (day.mode === 'closed')
      rows.push({ dayOfWeek, isClosed: true, is24Hours: false, sortOrder: 0 });
    if (day.mode === '24h')
      rows.push({ dayOfWeek, isClosed: false, is24Hours: true, sortOrder: 0 });
    if (day.mode === 'open') {
      for (const [position, slot] of day.slots.entries()) {
        if (!slot.open || !slot.close) {
          return { error: `${DAY_NAMES[index]}: set both the opening and closing time.` };
        }
        if (slot.open === slot.close) {
          return { error: `${DAY_NAMES[index]}: opening and closing time are the same.` };
        }
        rows.push({
          dayOfWeek,
          openTime: slot.open,
          closeTime: slot.close,
          isClosed: false,
          is24Hours: false,
          sortOrder: position,
          ...(slot.label.trim() ? { slotLabel: slot.label.trim() } : {}),
        });
      }
    }
  }
  return { rows };
}

function WeekEditor({
  place,
  setPlace,
}: {
  place: OwnedPlace;
  setPlace: (place: OwnedPlace) => void;
}) {
  const toast = useToast();
  const baseline = useMemo(() => daysOf(place), [place]);
  const [days, setDays] = useState<Day[]>(baseline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(days) !== JSON.stringify(baseline);
  useLeaveGuard(dirty);

  const update = (index: number, next: Day) =>
    setDays((current) => current.map((day, position) => (position === index ? next : day)));

  async function save() {
    const result = toRows(days);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      setPlace((await businessService.updatePlace(place.id, { hours: result.rows })).data);
      toast.show('Opening hours saved');
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not save the hours.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Panel
        title="Weekly hours"
        action={
          <button
            type="button"
            onClick={() =>
              setDays((current) => current.map(() => structuredClone(current[0] as Day)))
            }
            className="text-sm font-medium text-action hover:text-action-hover"
          >
            Copy Monday to every day
          </button>
        }
      >
        <ul className="flex flex-col divide-y divide-line">
          {days.map((day, index) => (
            <li
              key={DAY_NAMES[index]}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start"
            >
              <div className="flex w-full items-center justify-between gap-3 sm:w-64 sm:shrink-0">
                <span className="font-medium text-ink">{DAY_NAMES[index]}</span>
                <select
                  value={day.mode}
                  aria-label={`${DAY_NAMES[index]} status`}
                  onChange={(event) => {
                    const mode = event.target.value as Mode;
                    update(index, {
                      mode,
                      slots:
                        mode === 'open'
                          ? day.slots.length
                            ? day.slots
                            : [{ open: '09:00', close: '21:00', label: '' }]
                          : [],
                    });
                  }}
                  className="h-10 w-40 rounded-lg border border-control bg-surface px-2.5 text-sm text-ink"
                >
                  <option value="open">Open</option>
                  <option value="24h">Open 24 hours</option>
                  <option value="closed">Closed</option>
                  <option value="unset">Not listed</option>
                </select>
              </div>
              {day.mode === 'open' && (
                <div className="flex flex-1 flex-col gap-2">
                  {day.slots.map((slot, position) => (
                    <div key={position} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={slot.open}
                        aria-label="Opens"
                        onChange={(event) =>
                          update(index, {
                            ...day,
                            slots: day.slots.map((s, i) =>
                              i === position ? { ...s, open: event.target.value } : s,
                            ),
                          })
                        }
                        className={TIME_INPUT}
                      />
                      <span className="text-sm text-muted">to</span>
                      <input
                        type="time"
                        value={slot.close}
                        aria-label="Closes"
                        onChange={(event) =>
                          update(index, {
                            ...day,
                            slots: day.slots.map((s, i) =>
                              i === position ? { ...s, close: event.target.value } : s,
                            ),
                          })
                        }
                        className={TIME_INPUT}
                      />
                      <input
                        type="text"
                        value={slot.label}
                        maxLength={50}
                        placeholder="Label (e.g. Lunch)"
                        aria-label="Slot label"
                        onChange={(event) =>
                          update(index, {
                            ...day,
                            slots: day.slots.map((s, i) =>
                              i === position ? { ...s, label: event.target.value } : s,
                            ),
                          })
                        }
                        className={`${TIME_INPUT} w-36`}
                      />
                      {day.slots.length > 1 && (
                        <button
                          type="button"
                          aria-label="Remove this time slot"
                          onClick={() =>
                            update(index, {
                              ...day,
                              slots: day.slots.filter((_, i) => i !== position),
                            })
                          }
                          className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-danger-700"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {day.slots.length < MAX_SLOTS && (
                    <button
                      type="button"
                      onClick={() =>
                        update(index, {
                          ...day,
                          slots: [...day.slots, { open: '', close: '', label: '' }],
                        })
                      }
                      className="w-fit text-sm font-medium text-action"
                    >
                      + Add another time (e.g. dinner)
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Closing after midnight is fine (e.g. 18:00 to 02:00). Students see “Open now” or “Closed”
          from these hours, in India time.
        </p>
      </Panel>
      {error && (
        <p className="mt-4 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>
      )}
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => {
          setDays(baseline);
          setError(null);
        }}
      />
    </>
  );
}

export function HoursEditor() {
  return (
    <>
      <PageHeader
        title="Opening hours"
        description="When students can come in. Shown on your page with a live open/closed status."
      />
      <PlaceScope>
        {(place, setPlace) => <WeekEditor place={place} setPlace={setPlace} />}
      </PlaceScope>
    </>
  );
}
