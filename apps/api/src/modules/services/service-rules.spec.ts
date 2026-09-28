import { AppException } from '../../common/http/app-exception.js';
import {
  assertEditableMenuDate,
  configOf,
  dateFromKey,
  mealsOf,
  menuItemRows,
  parseSubmittedConfig,
  todayAndTomorrow,
} from './service-rules.js';

describe('service rules', () => {
  it('fills in defaults and falls back to them for a stored config that no longer parses', () => {
    expect(configOf('FOOD_ORDER', null)).toEqual({
      acceptingOrders: true,
      tableOrdering: true,
      pickupOrdering: true,
    });
    expect(configOf('DAILY_MENU', { monthlyPrice: 'lots' })).toEqual({ monthlyPrice: null });
    expect(configOf('LISTING', { anything: 1 })).toEqual({});
  });

  it('rejects a submitted config that does not fit the kind, with prefixed field errors', () => {
    try {
      parseSubmittedConfig('PRINT_ORDER', { bwPricePerPage: 1.5 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect(JSON.stringify((error as AppException).details)).toContain('config.bwPricePerPage');
    }
    expect(parseSubmittedConfig('PRINT_ORDER', { colorPricePerPage: 10 })).toMatchObject({
      bwPricePerPage: 2,
      colorPricePerPage: 10,
      paperSizes: ['A4'],
    });
  });

  it('groups dishes per meal in order and drops duplicates within a meal', () => {
    const rows = menuItemRows({
      BREAKFAST: ['Poha', 'Tea', 'tea'],
      LUNCH: ['Tea', 'Dal'],
      SNACKS: [],
      DINNER: ['Roti'],
    });
    expect(rows.map((row) => `${row.meal}:${row.name}`)).toEqual([
      'BREAKFAST:Poha',
      'BREAKFAST:Tea',
      'LUNCH:Tea',
      'LUNCH:Dal',
      'DINNER:Roti',
    ]);
    expect(mealsOf([...rows].reverse())).toEqual({
      BREAKFAST: ['Poha', 'Tea'],
      LUNCH: ['Tea', 'Dal'],
      SNACKS: [],
      DINNER: ['Roti'],
    });
  });

  it('works out India dates: 20:00 UTC is already the next day in India', () => {
    const { today, tomorrow } = todayAndTomorrow(new Date('2026-09-28T20:00:00Z'));
    expect(today.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(tomorrow.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('allows editing a week back and two weeks ahead only', () => {
    const now = new Date('2026-09-28T06:00:00Z');
    expect(() => assertEditableMenuDate(dateFromKey('2026-09-21'), now)).not.toThrow();
    expect(() => assertEditableMenuDate(dateFromKey('2026-10-12'), now)).not.toThrow();
    expect(() => assertEditableMenuDate(dateFromKey('2026-09-20'), now)).toThrow(AppException);
    expect(() => assertEditableMenuDate(dateFromKey('2026-10-13'), now)).toThrow(AppException);
  });
});
