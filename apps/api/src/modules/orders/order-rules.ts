import { randomBytes, randomInt } from 'node:crypto';
import {
  FINAL_ORDER_STATUSES,
  type ItemOption,
  type OrderKind,
  type OrderStatus,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';

/**
 * The moves each kind of order allows. Anything else is refused, so an order can never jump from
 * "pending" to "completed" or come back from "cancelled".
 */
const TRANSITIONS: Readonly<
  Record<OrderKind, Partial<Record<OrderStatus, readonly OrderStatus[]>>>
> = {
  FOOD: {
    PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['SERVED', 'COMPLETED'],
    SERVED: ['COMPLETED'],
  },
  PRINT: {
    PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['COMPLETED'],
  },
};

export function nextStatuses(kind: OrderKind, from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[kind][from] ?? [];
}

export function canMove(kind: OrderKind, from: OrderStatus, to: OrderStatus): boolean {
  return nextStatuses(kind, from).includes(to);
}

export const isFinal = (status: OrderStatus): boolean => FINAL_ORDER_STATUSES.includes(status);

/** A student may cancel only before the business has accepted. */
export const studentCanCancel = (status: OrderStatus): boolean => status === 'PENDING';

// ── Codes and tokens ─────────────────────────────────────────────────────────────────────────────

/** No 0/O or 1/I, so a code read aloud at a counter is never ambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function shortCode(length: number, prefix = ''): string {
  let code = prefix;
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export const orderCode = (): string => shortCode(6, 'CP');

/** A QR token: 128 random bits, URL-safe, 22 characters. Unguessable, and carries no id. */
export const qrToken = (): string => randomBytes(16).toString('base64url');

// ── Pricing ──────────────────────────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
  options: ItemOption[];
}

export interface RequestedLine {
  itemId: string;
  quantity: number;
  options: string[];
}

export interface PricedLine {
  serviceItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options: ItemOption[];
  lineTotal: number;
}

/**
 * Prices an order from the place's own catalogue. The client sends ids, quantities and add-on names
 * only; every rupee is worked out here. Unknown, unavailable or foreign items are refused.
 */
export function priceLines(
  requested: readonly RequestedLine[],
  catalog: ReadonlyMap<string, CatalogItem>,
): { lines: PricedLine[]; subtotal: number } {
  const problems: Record<string, string[]> = {};
  const lines: PricedLine[] = [];
  requested.forEach((line, index) => {
    const item = catalog.get(line.itemId);
    if (!item) {
      problems[`items.${index}.itemId`] = ['This item is not on the menu'];
      return;
    }
    if (!item.available) {
      problems[`items.${index}.itemId`] = [`${item.name} is not available right now`];
      return;
    }
    const chosen: ItemOption[] = [];
    for (const name of new Set(line.options.map((option) => option.trim().toLowerCase()))) {
      const option = item.options.find((candidate) => candidate.name.toLowerCase() === name);
      if (!option) {
        problems[`items.${index}.options`] = [`${item.name} has no such add-on`];
        return;
      }
      chosen.push(option);
    }
    const unitPrice = item.price + chosen.reduce((sum, option) => sum + option.price, 0);
    lines.push({
      serviceItemId: item.id,
      name: item.name,
      unitPrice,
      quantity: line.quantity,
      options: chosen,
      lineTotal: unitPrice * line.quantity,
    });
  });
  if (Object.keys(problems).length > 0) throw AppException.validation(problems);
  return { lines, subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0) };
}

/** Stored add-on JSON back into a clean list (bad rows are dropped, never trusted). */
export function optionsOf(raw: unknown): ItemOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { name, price } = entry as { name?: unknown; price?: unknown };
    return typeof name === 'string' &&
      typeof price === 'number' &&
      Number.isInteger(price) &&
      price >= 0
      ? [{ name, price }]
      : [];
  });
}
