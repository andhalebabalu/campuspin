import {
  MEAL_SLOTS,
  type ConfigurableServiceKind,
  type MealSlot,
  type Meals,
  type ServiceKind,
  isConfigurableKind,
  serviceConfigSchemas,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { issuesToFieldErrors } from '../../common/http/zod-issues.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { daysBefore, dayKey, istDay } from '../analytics/activity-rules.js';

/**
 * The kinds a business can switch on today. A kind is added here only once its whole student and
 * business flow works, so the apps never offer a service that does nothing.
 */
export const SUPPORTED_KINDS: ReadonlySet<ConfigurableServiceKind> = new Set([
  'DAILY_MENU',
  'FOOD_ORDER',
  'TABLE_SERVICE',
  'PRINT_ORDER',
  'SERVICE_REQUEST',
]);

/** Kinds whose students order or pick from the place's catalogue. */
export const CATALOG_KINDS: ReadonlySet<string> = new Set(['FOOD_ORDER', 'SERVICE_REQUEST']);

export const isSupportedKind = (kind: ServiceKind): kind is ConfigurableServiceKind =>
  isConfigurableKind(kind) && SUPPORTED_KINDS.has(kind);

/**
 * A stored or submitted `config`, validated against its kind's schema with the defaults filled in.
 * Stored JSON that no longer parses (an older shape) falls back to the defaults rather than failing.
 */
export function configOf(kind: ServiceKind, raw: unknown): Record<string, unknown> {
  if (!isConfigurableKind(kind)) return {};
  const schema = serviceConfigSchemas[kind];
  const parsed = schema.safeParse(raw ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as Record<string, unknown>;
}

/** Validates a config sent by an owner: 400 with field errors when it does not fit the kind. */
export function parseSubmittedConfig(
  kind: ConfigurableServiceKind,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = serviceConfigSchemas[kind].safeParse(raw);
  if (!parsed.success) {
    const fields = issuesToFieldErrors(parsed.error.issues);
    throw AppException.validation(
      Object.fromEntries(Object.entries(fields).map(([key, value]) => [`config.${key}`, value])),
    );
  }
  return parsed.data as Record<string, unknown>;
}

/** The Prisma filter for a place service students can use right now. */
export const LIVE_SERVICE_WHERE = {
  enabled: true,
  disabledByAdmin: false,
  serviceType: { status: 'ACTIVE' },
} satisfies Prisma.PlaceServiceWhereInput;

/** A place students can use services of: live, and run by an active business. */
export const SERVICE_PLACE_WHERE = {
  status: 'ACTIVE',
  businessProfile: { status: 'ACTIVE' },
} satisfies Prisma.PlaceWhereInput;

/** Places with a live service of the given type. */
export const placesWithService = (serviceTypeId: string): Prisma.PlaceWhereInput => ({
  ...SERVICE_PLACE_WHERE,
  services: { some: { serviceTypeId, ...LIVE_SERVICE_WHERE } },
});

// ── Dates (India) ────────────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` as the UTC-midnight Date a DATE column stores. */
export const dateFromKey = (key: string): Date => new Date(`${key}T00:00:00.000Z`);

export function todayAndTomorrow(now: Date = new Date()): { today: Date; tomorrow: Date } {
  const today = istDay(now);
  return { today, tomorrow: daysBefore(today, -1) };
}

/** How far back and ahead an owner may edit a menu. */
export const MENU_EDIT_WINDOW = { pastDays: 7, futureDays: 14 } as const;

export function assertEditableMenuDate(date: Date, now: Date = new Date()): void {
  const today = istDay(now);
  const earliest = daysBefore(today, MENU_EDIT_WINDOW.pastDays);
  const latest = daysBefore(today, -MENU_EDIT_WINDOW.futureDays);
  if (date < earliest || date > latest) {
    throw AppException.validation({
      date: [
        `Menus can be edited from ${dayKey(earliest)} to ${dayKey(latest)} (${MENU_EDIT_WINDOW.pastDays} days back, ${MENU_EDIT_WINDOW.futureDays} ahead).`,
      ],
    });
  }
}

// ── Menu shaping ─────────────────────────────────────────────────────────────────────────────────

export interface MenuItemRow {
  meal: MealSlot;
  name: string;
  sortOrder: number;
}

/** Stored dishes grouped per meal, in the owner's order. */
export function mealsOf(items: readonly MenuItemRow[]): Meals {
  const meals = Object.fromEntries(MEAL_SLOTS.map((meal) => [meal, [] as string[]])) as Meals;
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    meals[item.meal].push(item.name);
  }
  return meals;
}

/** Rows to insert for a day's dishes; duplicates within one meal are dropped (case-insensitive). */
export function menuItemRows(meals: Meals): MenuItemRow[] {
  const rows: MenuItemRow[] = [];
  for (const meal of MEAL_SLOTS) {
    const seen = new Set<string>();
    for (const name of meals[meal]) {
      const key = name.toLocaleLowerCase('en-IN');
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ meal, name, sortOrder: rows.length });
    }
  }
  return rows;
}
