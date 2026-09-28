'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessListing, ItemOption, ServiceItem } from '@platform/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { rupees } from '@/features/orders/lib/use-cart';
import { sectionsOfItems } from '../lib/sections';
import { ordersService } from '@/services/orders.service';
import { NotLiveNote, PlacePicker } from './place-picker';

const INPUT = 'h-10 rounded-md border border-control bg-surface px-3 text-sm';

interface Draft {
  id: string | null;
  section: string;
  name: string;
  description: string;
  price: string;
  isVeg: 'veg' | 'nonveg' | '';
  options: string;
}

const EMPTY: Draft = {
  id: null,
  section: '',
  name: '',
  description: '',
  price: '',
  isVeg: '',
  options: '',
};

/** "Extra cheese: 20, Jalapeno: 15" <-> add-on list. */
const optionsText = (options: ItemOption[]) =>
  options.map((option) => `${option.name}: ${option.price}`).join(', ');
function parseOptions(text: string): ItemOption[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name = '', price = '0'] = part.split(':');
      return { name: name.trim(), price: Math.max(0, Math.round(Number(price.trim()) || 0)) };
    })
    .filter((option) => option.name);
}

/**
 * The food menu students order from: sections ("Breakfast", "Beverages"), dishes with prices, veg
 * marks and paid add-ons. "Sold out" hides a dish without deleting it.
 */
export function FoodMenuPanel({
  listings,
  serviceKey = 'ORDER_FOOD',
}: {
  listings: BusinessListing[];
  serviceKey?: string;
}) {
  const toast = useToast();
  const [placeId, setPlaceId] = useState('');
  const [loaded, setLoaded] = useState<{ placeId: string; items: ServiceItem[] } | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const items = loaded?.placeId === placeId ? loaded.items : null;

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    ordersService
      .items(placeId, serviceKey, controller.signal)
      .then((result) => {
        setLoaded({ placeId, items: result.data });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your menu.' },
        );
      });
    return () => controller.abort();
  }, [placeId, serviceKey, reload]);

  const replace = (next: ServiceItem[]) => setLoaded({ placeId, items: next });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !items) return;
    setBusy(true);
    setProblem(null);
    const body = {
      section: draft.section.trim(),
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      price: Math.round(Number(draft.price)),
      isVeg: draft.isVeg === '' ? null : draft.isVeg === 'veg',
      options: parseOptions(draft.options),
    };
    try {
      if (draft.id) {
        const result = await ordersService.updateItem(placeId, draft.id, body);
        replace(items.map((item) => (item.id === draft.id ? result.data : item)));
      } else {
        const result = await ordersService.addItem(placeId, {
          ...body,
          serviceKey,
          available: true,
          sortOrder: items.length,
        });
        replace([...items, result.data]);
      }
      toast.show(draft.id ? 'Item updated' : 'Item added');
      setDraft(draft.id ? null : { ...EMPTY, section: draft.section });
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setProblem(fields ? Object.values(fields).flat().join(' ') : caught.message);
      } else setProblem('Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ServiceItem) {
    try {
      const result = await ordersService.updateItem(placeId, item.id, {
        available: !item.available,
      });
      replace((items ?? []).map((row) => (row.id === item.id ? result.data : row)));
      toast.show(result.data.available ? `${item.name} is back` : `${item.name} marked sold out`);
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not update.', 'error');
    }
  }

  async function remove(item: ServiceItem) {
    if (!window.confirm(`Delete ${item.name}? Past orders keep it.`)) return;
    try {
      await ordersService.deleteItem(placeId, item.id);
      replace((items ?? []).filter((row) => row.id !== item.id));
      toast.show('Item deleted');
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not delete.', 'error');
    }
  }

  if (listings.length === 0)
    return (
      <EmptyState
        title="Add a listing first"
        description="A menu belongs to one of your listings."
      />
    );
  const sectionNames = [...new Set((items ?? []).map((item) => item.section).filter(Boolean))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-body">
          The menu students order from at their table or for pickup. Prices are checked again by
          CampusPin on every order, so students always pay what is listed here.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
          <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
            <Icon name="plus" className="size-4" /> Add item
          </Button>
        </div>
      </div>
      <NotLiveNote listing={listings.find((listing) => listing.id === placeId)} />

      {draft && (
        <Card className="p-5">
          <form onSubmit={(event) => void save(event)} className="grid gap-3 sm:grid-cols-2">
            <p className="font-semibold text-ink sm:col-span-2">
              {draft.id ? 'Edit item' : 'New item'}
            </p>
            <input
              list="menu-sections"
              value={draft.section}
              onChange={(event) => setDraft({ ...draft, section: event.target.value })}
              placeholder="Section, e.g. Breakfast"
              maxLength={60}
              className={INPUT}
              aria-label="Section"
            />
            <datalist id="menu-sections">
              {sectionNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <input
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Dish name"
              maxLength={100}
              className={INPUT}
              aria-label="Dish name"
            />
            <input
              required
              type="number"
              min={0}
              step={1}
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
              placeholder="Price (₹)"
              className={INPUT}
              aria-label="Price in rupees"
            />
            <select
              value={draft.isVeg}
              onChange={(event) =>
                setDraft({ ...draft, isVeg: event.target.value as Draft['isVeg'] })
              }
              className={INPUT}
              aria-label="Veg or non-veg"
            >
              <option value="">Veg / non-veg: not said</option>
              <option value="veg">Veg</option>
              <option value="nonveg">Non-veg</option>
            </select>
            <input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Short description (optional)"
              maxLength={300}
              className={`${INPUT} sm:col-span-2`}
              aria-label="Description"
            />
            <input
              value={draft.options}
              onChange={(event) => setDraft({ ...draft, options: event.target.value })}
              placeholder="Add-ons with prices, e.g. Extra cheese: 20, Jalapeno: 15"
              className={`${INPUT} sm:col-span-2`}
              aria-label="Add-ons"
            />
            {problem && <p className="text-sm text-danger-700 sm:col-span-2">{problem}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" size="sm" loading={busy}>
                {draft.id ? 'Save' : 'Add to menu'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Close
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setReload((n) => n + 1)}
        />
      ) : !items ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Your menu is empty"
          description="Add your dishes with prices. Students see only what is not sold out."
        />
      ) : (
        sectionsOfItems(items).map((section) => (
          <Card key={section.name || 'menu'} className="px-5">
            <h3 className="pt-4 font-semibold text-ink">{section.name || 'Menu'}</h3>
            <ul className="divide-y divide-line">
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className={item.available ? '' : 'opacity-50'}>
                    <p className="font-medium text-ink">
                      {item.name}{' '}
                      {!item.available && (
                        <span className="text-xs text-danger-700">(sold out)</span>
                      )}
                    </p>
                    <p className="text-sm text-body">
                      {rupees(item.price)}
                      {item.options.length > 0 && ` · add-ons: ${optionsText(item.options)}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => void toggle(item)}>
                      {item.available ? 'Sold out' : 'Available'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          id: item.id,
                          section: item.section,
                          name: item.name,
                          description: item.description ?? '',
                          price: String(item.price),
                          isVeg: item.isVeg === null ? '' : item.isVeg ? 'veg' : 'nonveg',
                          options: optionsText(item.options),
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(item)}>
                      <Icon name="trash" className="size-4" label={`Delete ${item.name}`} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
