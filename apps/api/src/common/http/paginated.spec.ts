import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { Paginated, pageWindow } from './paginated.js';
import { ResponseInterceptor } from './response.interceptor.js';

describe('Paginated.of', () => {
  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [41, 20, 3],
    [100, 50, 2],
  ])('%i items at %i per page is %i pages', (total, limit, totalPages) => {
    expect(Paginated.of([], { page: 1, limit, total }).meta.totalPages).toBe(totalPages);
  });

  it('carries the page details', () => {
    const page = Paginated.of(['a', 'b'], { page: 2, limit: 2, total: 5 });
    expect(page.items).toEqual(['a', 'b']);
    expect(page.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });
});

describe('pageWindow', () => {
  it('converts a 1-based page into skip and take', () => {
    expect(pageWindow({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
    expect(pageWindow({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
    expect(pageWindow({ page: 2, limit: 50 })).toEqual({ skip: 50, take: 50 });
  });
});

describe('ResponseInterceptor with pagination', () => {
  const run = (data: unknown, statusCode = 200) => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const context = {
      getType: () => 'http',
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of(data) };
    return lastValueFrom(interceptor.intercept(context, handler));
  };

  it('renders a Paginated result as the list envelope: items as data, details as meta', async () => {
    const body = await run(Paginated.of([{ id: 1 }], { page: 1, limit: 20, total: 1 }));
    expect(body).toEqual({
      success: true,
      data: [{ id: 1 }],
      message: 'Success',
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('renders an empty page with an empty array, never null', async () => {
    const body = (await run(Paginated.of([], { page: 1, limit: 20, total: 0 }))) as {
      data: unknown;
      meta: { totalPages: number };
    };
    expect(body.data).toEqual([]);
    expect(body.meta.totalPages).toBe(0);
  });

  it('leaves every other response exactly as before: no meta', async () => {
    expect(await run({ a: 1 })).toEqual({ success: true, data: { a: 1 }, message: 'Success' });
    expect(await run(undefined)).toEqual({ success: true, data: null, message: 'Success' });
    expect(await run([1, 2])).toEqual({ success: true, data: [1, 2], message: 'Success' });
  });

  it('still sends nothing for a 204', async () => {
    expect(await run(Paginated.of([], { page: 1, limit: 1, total: 0 }), 204)).toBeUndefined();
  });
});
