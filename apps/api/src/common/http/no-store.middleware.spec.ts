import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';
import { noStoreFor } from './no-store.middleware.js';

function run(path: string) {
  const setHeader = vi.fn();
  const next = vi.fn() as unknown as NextFunction;
  noStoreFor(['/api/v1/auth', '/api/v1/admin'])(
    { path } as Request,
    { setHeader } as unknown as Response,
    next,
  );
  return { setHeader, next };
}

describe('noStoreFor', () => {
  it.each([
    '/api/v1/auth',
    '/api/v1/auth/login',
    '/api/v1/auth/me',
    '/api/v1/admin/colleges',
    '/api/v1/admin/colleges/abc/images/def',
  ])('marks %s as no-store', (path) => {
    const { setHeader } = run(path);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([
    '/api/v1/colleges',
    '/api/v1/health',
    '/api/v1/authors',
    '/api/v1/administrators',
    '/api/v2/auth/login',
    '/',
  ])('leaves %s alone (a prefix must match a whole path segment)', (path) => {
    expect(run(path).setHeader).not.toHaveBeenCalled();
  });

  it('always continues to the next handler', () => {
    expect(run('/api/v1/auth/login').next).toHaveBeenCalledTimes(1);
    expect(run('/api/v1/colleges').next).toHaveBeenCalledTimes(1);
  });
});
