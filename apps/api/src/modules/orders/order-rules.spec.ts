import { AppException } from '../../common/http/app-exception.js';
import {
  type CatalogItem,
  canMove,
  isFinal,
  nextStatuses,
  optionsOf,
  orderCode,
  priceLines,
  qrToken,
  studentCanCancel,
} from './order-rules.js';

const catalog = new Map<string, CatalogItem>([
  ['poha', { id: 'poha', name: 'Poha', price: 30, available: true, options: [] }],
  [
    'pizza',
    {
      id: 'pizza',
      name: 'Pizza',
      price: 150,
      available: true,
      options: [
        { name: 'Extra cheese', price: 20 },
        { name: 'Jalapeno', price: 15 },
      ],
    },
  ],
  ['dosa', { id: 'dosa', name: 'Dosa', price: 60, available: false, options: [] }],
]);

describe('order rules', () => {
  it('prices every line on the server, add-ons included', () => {
    const { lines, subtotal } = priceLines(
      [
        { itemId: 'poha', quantity: 2, options: [] },
        { itemId: 'pizza', quantity: 3, options: ['extra CHEESE', 'Jalapeno', 'Extra cheese'] },
      ],
      catalog,
    );
    expect(lines.map((line) => [line.name, line.unitPrice, line.lineTotal])).toEqual([
      ['Poha', 30, 60],
      ['Pizza', 185, 555],
    ]);
    expect(subtotal).toBe(615);
  });

  it('refuses unknown items, unavailable items and made-up add-ons', () => {
    for (const line of [
      { itemId: 'burger', quantity: 1, options: [] },
      { itemId: 'dosa', quantity: 1, options: [] },
      { itemId: 'poha', quantity: 1, options: ['Gold leaf'] },
    ]) {
      expect(() => priceLines([line], catalog)).toThrow(AppException);
    }
  });

  it('allows only the moves of each kind', () => {
    expect(canMove('FOOD', 'PENDING', 'ACCEPTED')).toBe(true);
    expect(canMove('FOOD', 'PENDING', 'COMPLETED')).toBe(false);
    expect(canMove('FOOD', 'READY', 'SERVED')).toBe(true);
    expect(canMove('PRINT', 'READY', 'SERVED')).toBe(false);
    expect(canMove('FOOD', 'CANCELLED', 'ACCEPTED')).toBe(false);
    expect(nextStatuses('FOOD', 'COMPLETED')).toEqual([]);
    expect(isFinal('REJECTED')).toBe(true);
    expect(studentCanCancel('PENDING')).toBe(true);
    expect(studentCanCancel('ACCEPTED')).toBe(false);
  });

  it('makes unambiguous order codes and unguessable QR tokens', () => {
    expect(orderCode()).toMatch(/^CP[A-HJ-NP-Z2-9]{6}$/);
    const tokens = new Set(Array.from({ length: 200 }, () => qrToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('drops malformed stored add-ons', () => {
    expect(
      optionsOf([{ name: 'Cheese', price: 20 }, { name: 'Bad', price: -1 }, 'x', null]),
    ).toEqual([{ name: 'Cheese', price: 20 }]);
    expect(optionsOf(null)).toEqual([]);
  });
});
