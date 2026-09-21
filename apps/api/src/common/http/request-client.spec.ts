import type { Request } from 'express';
import { readClientContext } from './request-client.decorator.js';

const request = (parts: Record<string, unknown>) => parts as unknown as Request;

describe('readClientContext', () => {
  it('reads the address, user agent and request id', () => {
    expect(
      readClientContext(
        request({
          ip: '203.0.113.7',
          headers: { 'user-agent': 'Mozilla/5.0' },
          id: 'req-12345678',
        }),
      ),
    ).toEqual({ ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0', requestId: 'req-12345678' });
  });

  it('accepts a numeric request id', () => {
    expect(readClientContext(request({ headers: {}, id: 42 })).requestId).toBe('42');
  });

  it('omits what is missing (and ignores an id that is not a string or number)', () => {
    expect(readClientContext(request({ headers: {}, id: { weird: true } }))).toEqual({});
  });

  it('truncates values to the database column widths, so an insert can never fail on length', () => {
    const context = readClientContext(
      request({
        ip: 'x'.repeat(100),
        headers: { 'user-agent': 'y'.repeat(1000) },
        id: 'z'.repeat(200),
      }),
    );
    expect(context.ipAddress).toHaveLength(45);
    expect(context.userAgent).toHaveLength(255);
    expect(context.requestId).toHaveLength(64);
  });
});
