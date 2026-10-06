import type { ItemOption, ServiceItem } from '@platform/contracts';
import { useCallback, useSyncExternalStore } from 'react';

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  /** One item with its add-ons, for display only: the server prices the order again. */
  unitPrice: number;
  options: ItemOption[];
  quantity: number;
}

// One cart per place, kept while the app runs so going back to the menu does not lose it.
const carts = new Map<string, CartLine[]>();
const listeners = new Set<() => void>();
const EMPTY: CartLine[] = [];

function set(placeId: string, lines: CartLine[]) {
  carts.set(placeId, lines);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCart(placeId: string | null) {
  const lines = useSyncExternalStore(subscribe, () => (placeId ? (carts.get(placeId) ?? EMPTY) : EMPTY));

  const add = useCallback(
    (item: ServiceItem, options: ItemOption[]) => {
      if (!placeId) return;
      const key = [item.id, ...options.map((option) => option.name).sort()].join('|');
      const unitPrice = item.price + options.reduce((sum, option) => sum + option.price, 0);
      const current = carts.get(placeId) ?? [];
      const existing = current.find((line) => line.key === key);
      set(
        placeId,
        existing
          ? current.map((line) => (line.key === key ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line))
          : [...current, { key, itemId: item.id, name: item.name, unitPrice, options, quantity: 1 }],
      );
    },
    [placeId],
  );

  const setQuantity = useCallback(
    (key: string, quantity: number) => {
      if (!placeId) return;
      const current = carts.get(placeId) ?? [];
      set(
        placeId,
        quantity <= 0
          ? current.filter((line) => line.key !== key)
          : current.map((line) => (line.key === key ? { ...line, quantity: Math.min(20, quantity) } : line)),
      );
    },
    [placeId],
  );

  const clear = useCallback(() => {
    if (placeId) set(placeId, []);
  }, [placeId]);

  return {
    lines,
    add,
    setQuantity,
    clear,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    countOf: (itemId: string) =>
      lines.filter((line) => line.itemId === itemId).reduce((sum, line) => sum + line.quantity, 0),
  };
}

export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

/** A retry-safe key for one checkout (Hermes has no crypto.randomUUID). */
export const newIdempotencyKey = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
