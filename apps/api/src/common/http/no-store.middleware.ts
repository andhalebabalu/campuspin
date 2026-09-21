import type { NextFunction, Request, Response } from 'express';

/**
 * Marks every response under the given path prefixes `Cache-Control: no-store`, so no browser, proxy
 * or CDN keeps them. Used for the routes whose responses are private to the caller (they carry
 * tokens, profile data or staff views), instead of relying on each controller to remember.
 * Public, user-agnostic routes are untouched and set their own caching.
 */
export function noStoreFor(prefixes: readonly string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const { path } = request;
    if (prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      response.setHeader('Cache-Control', 'no-store');
    }
    next();
  };
}
