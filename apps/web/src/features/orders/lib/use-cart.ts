'use client';

import type { ItemOption, ServiceItem } from '@platform/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  /** One item with its add-ons, as shown now. The server prices the order again. */
  unitPrice: number;
  options: ItemOption[];
  quantity: number;
}

const storageKey = (placeId: string) => `campuspin.cart.${placeId}`;

function read(placeId: string): CartLine[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(placeId));
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

/**
 * The cart for one place, kept for the browser tab so a reload does not lose it. Prices here are only
 * for display: the order is priced again by the server from the live menu.
 */
export function useCart(placeId: string | null) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    void Promise.resolve(read(placeId)).then((stored) => {
      if (!cancelled) setLines(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  const persist = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      if (!placeId) return;
      try {
        window.sessionStorage.setItem(storageKey(placeId), JSON.stringify(next));
      } catch {
        // Private mode: the cart still works for this page.
      }
    },
    [placeId],
  );

  const add = useCallback(
    (item: ServiceItem, options: ItemOption[]) => {
      const key = [item.id, ...options.map((option) => option.name).sort()].join('|');
      const unitPrice = item.price + options.reduce((sum, option) => sum + option.price, 0);
      const existing = lines.find((line) => line.key === key);
      persist(
        existing
          ? lines.map((line) =>
              line.key === key ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line,
            )
          : [...lines, { key, itemId: item.id, name: item.name, unitPrice, options, quantity: 1 }],
      );
    },
    [lines, persist],
  );

  const setQuantity = useCallback(
    (key: string, quantity: number) =>
      persist(
        quantity <= 0
          ? lines.filter((line) => line.key !== key)
          : lines.map((line) =>
              line.key === key ? { ...line, quantity: Math.min(20, quantity) } : line,
            ),
      ),
    [lines, persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const totals = useMemo(
    () => ({
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    }),
    [lines],
  );

  const countOf = useCallback(
    (itemId: string) =>
      lines.filter((line) => line.itemId === itemId).reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  return { lines, add, setQuantity, clear, countOf, ...totals };
}

export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
