'use client';

import { ApiClientError } from '@platform/api-client';
import {
  MAX_PLACE_PRICE_OPTIONS,
  PRICE_UNITS,
  placePriceOptionInputSchema,
  type OwnedPlace,
  type PlacePriceOptionInput,
  type PriceUnit,
} from '@platform/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { DailyMenuPanel } from '@/features/business/components/daily-menu-panel';
import { FoodMenuPanel } from '@/features/business/components/food-menu-panel';
import { ServicesPanel } from '@/features/business/components/services-panel';
import { businessService } from '@/services/business.service';
import { UNIT_LABELS } from '@/utils/format-price';
import { PlaceScope } from '../place-scope';
import { DASHBOARD } from '../routes';
import { SaveBar, useLeaveGuard } from '../unsaved';
import { useWorkspace } from '../workspace';
import { Panel } from './overview';

interface Row {
  label: string;
  amount: string;
  unit: PriceUnit;
  note: string;
}

const rowsOf = (place: OwnedPlace): Row[] =>
  place.priceOptions.map((option) => ({
    label: option.label,
    amount: String(option.amount),
    unit: option.unit,
    note: option.note ?? '',
  }));

const INPUT =
  'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted';

function PriceList({
  place,
  setPlace,
}: {
  place: OwnedPlace;
  setPlace: (place: OwnedPlace) => void;
}) {
  const toast = useToast();
  const baseline = useMemo(() => rowsOf(place), [place]);
  const [rows, setRows] = useState<Row[]>(baseline);
  const [problems, setProblems] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(baseline);
  useLeaveGuard(dirty);

  const change = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function save() {
    const parsed: PlacePriceOptionInput[] = [];
    const found: Record<number, string> = {};
    rows.forEach((row, index) => {
      const result = placePriceOptionInputSchema.safeParse({
        label: row.label,
        amount: row.amount.trim() === '' ? Number.NaN : Number(row.amount),
        unit: row.unit,
        ...(row.note.trim() ? { note: row.note } : {}),
      });
      if (result.success) parsed.push(result.data);
      else
        found[index] = row.label.trim() ? 'Enter a whole-rupee price.' : 'Give this price a name.';
    });
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      setPlace((await businessService.updatePlace(place.id, { priceOptions: parsed })).data);
      toast.show('Prices saved');
    } catch (caught) {
      toast.show(
        caught instanceof ApiClientError ? caught.message : 'Could not save prices.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Panel
        title="Services & prices"
        action={
          rows.length < MAX_PLACE_PRICE_OPTIONS && (
            <button
              type="button"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { label: '', amount: '', unit: current.at(-1)?.unit ?? 'MONTH', note: '' },
                ])
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-subtle"
            >
              <Icon name="plus" className="size-4" /> Add service
            </button>
          )
        }
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="receipt" className="size-8 text-muted" />
            <p className="font-semibold text-ink">No services added yet.</p>
            <p className="max-w-sm text-sm text-muted">
              List what you offer with its price, e.g. “Monthly veg plan, ₹3,000 / month”.
            </p>
            <button
              type="button"
              onClick={() => setRows([{ label: '', amount: '', unit: 'MONTH', note: '' }])}
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover"
            >
              <Icon name="plus" className="size-4" /> Add Service
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li key={index} className="rounded-xl border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_7rem_9rem_auto]">
                  <input
                    className={`${INPUT} ${problems[index] && !row.label.trim() ? 'border-danger-600' : 'border-control'}`}
                    placeholder="Service, e.g. Monthly veg plan"
                    value={row.label}
                    maxLength={100}
                    aria-label="Service name"
                    onChange={(e) => change(index, { label: e.target.value })}
                  />
                  <input
                    className={`${INPUT} ${problems[index] && row.label.trim() ? 'border-danger-600' : 'border-control'}`}
                    placeholder="₹"
                    inputMode="numeric"
                    value={row.amount}
                    aria-label="Price in rupees"
                    onChange={(e) =>
                      change(index, { amount: e.target.value.replace(/[^\d]/g, '') })
                    }
                  />
                  <select
                    className={`${INPUT} border-control`}
                    value={row.unit}
                    aria-label="Per"
                    onChange={(e) => change(index, { unit: e.target.value as PriceUnit })}
                  >
                    {PRICE_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        / {UNIT_LABELS[unit]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Remove service"
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    className="justify-self-end rounded-lg p-2 text-muted hover:bg-subtle hover:text-danger-700"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
                <input
                  className={`${INPUT} mt-2 border-control`}
                  placeholder="Short description (optional)"
                  value={row.note}
                  maxLength={255}
                  aria-label="Description"
                  onChange={(e) => change(index, { note: e.target.value })}
                />
                {problems[index] && (
                  <p className="mt-1 text-sm text-danger-700">{problems[index]}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => {
          setRows(baseline);
          setProblems({});
        }}
      />
    </>
  );
}

const VIEWS = [
  { id: 'prices', label: 'Services & prices' },
  { id: 'features', label: 'Ordering & bookings' },
  { id: 'food', label: 'Food menu' },
  { id: 'daily', label: 'Daily menu' },
] as const;
type View = (typeof VIEWS)[number]['id'];

export function ServicesSection() {
  const router = useRouter();
  const params = useSearchParams();
  const { listings } = useWorkspace();
  const wanted = params.get('view');
  const view: View = VIEWS.some((item) => item.id === wanted) ? (wanted as View) : 'prices';

  return (
    <>
      <PageHeader
        title="Services & menu"
        description="What you offer and what it costs, plus the menus and services students can use on CampusPin."
      />
      <div
        role="tablist"
        aria-label="Services"
        className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-subtle p-1"
      >
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() =>
              router.replace(`${DASHBOARD.services}?view=${item.id}`, { scroll: false })
            }
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${view === item.id ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {view === 'prices' && (
        <PlaceScope>
          {(place, setPlace) => <PriceList place={place} setPlace={setPlace} />}
        </PlaceScope>
      )}
      {view === 'features' && <ServicesPanel listings={listings} />}
      {view === 'food' && <FoodMenuPanel listings={listings} />}
      {view === 'daily' && <DailyMenuPanel listings={listings} />}
    </>
  );
}
