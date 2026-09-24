import { healthSchema } from '@platform/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApiClient } from './index.js';

const BASE = 'http://localhost:3001/api/v1';

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** A typed stand-in for `fetch` whose calls can be inspected. */
function stubFetch(impl: FetchImpl) {
  return vi.fn<FetchImpl>(impl);
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function okResponse(data: unknown = null, message = 'ok'): Response {
  return jsonResponse({ success: true, data, message });
}

function clientWith(
  fetchStub: FetchImpl,
  extra: Partial<Parameters<typeof createApiClient>[0]> = {},
) {
  return createApiClient({ baseUrl: BASE, fetch: fetchStub, ...extra });
}

describe('createApiClient', () => {
  it('returns the unwrapped envelope and validates data with the schema', async () => {
    const fetchStub = stubFetch(() =>
      Promise.resolve(okResponse({ status: 'ok', database: 'connected' }, 'API is running')),
    );

    const result = await clientWith(fetchStub).get('/health', { schema: healthSchema });

    expect(result.data.status).toBe('ok');
    expect(result.message).toBe('API is running');
    expect(fetchStub).toHaveBeenCalledWith(
      `${BASE}/health`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('builds query strings, skipping empty values and joining arrays', async () => {
    const fetchStub = stubFetch(() => Promise.resolve(okResponse()));

    await clientWith(fetchStub).get('places', {
      query: {
        search: 'mess',
        page: 2,
        verified: true,
        empty: '',
        none: undefined,
        categorySlug: ['mess', 'pg'],
      },
    });

    const [input] = fetchStub.mock.calls[0] ?? [];
    expect(typeof input).toBe('string');
    const url = new URL(input as string);
    expect(url.pathname).toBe('/api/v1/places');
    expect(url.searchParams.get('search')).toBe('mess');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('verified')).toBe('true');
    expect(url.searchParams.get('categorySlug')).toBe('mess,pg');
    expect(url.searchParams.has('empty')).toBe(false);
    expect(url.searchParams.has('none')).toBe(false);
  });

  it('sends the bearer token, default headers and a JSON body', async () => {
    const fetchStub = stubFetch(() => Promise.resolve(okResponse({})));
    const client = clientWith(fetchStub, {
      getAccessToken: () => 'token-123',
      defaultHeaders: { 'X-Client': 'web' },
    });

    await client.post('/reviews', { body: { rating: 5 } });

    const [, init] = fetchStub.mock.calls[0] ?? [];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer token-123',
      'X-Client': 'web',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe(JSON.stringify({ rating: 5 }));
  });

  it('sends a FormData body untouched, letting fetch set the multipart Content-Type', async () => {
    const fetchStub = stubFetch(() => Promise.resolve(okResponse({})));
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'image/png' }), 'x.png');

    await clientWith(fetchStub).post('/uploads/images', { body: form });

    const [, init] = fetchStub.mock.calls[0] ?? [];
    expect(init?.body).toBe(form);
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });

  it('throws ApiClientError carrying code, details and request id from an error envelope', async () => {
    const fetchStub = stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          {
            success: false,
            message: 'Validation failed',
            error: { code: 'VALIDATION_ERROR', details: { fields: { email: ['Invalid email'] } } },
            requestId: 'req-1',
          },
          { status: 400 },
        ),
      ),
    );

    const error = await clientWith(fetchStub)
      .post('/auth/register', { body: {} })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    const apiError = error as ApiClientError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe('VALIDATION_ERROR');
    expect(apiError.requestId).toBe('req-1');
    expect(apiError.fieldErrors).toEqual({ email: ['Invalid email'] });
    expect(apiError.isRetryable).toBe(false);
  });

  it('maps network failures to a retryable NETWORK_ERROR', async () => {
    const fetchStub = stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    const error = (await clientWith(fetchStub)
      .get('/health')
      .catch((e: unknown) => e)) as ApiClientError;

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.isRetryable).toBe(true);
  });

  it('times out slow requests', async () => {
    const fetchStub = stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const error = (await clientWith(fetchStub, { timeoutMs: 20 })
      .get('/health')
      .catch((e: unknown) => e)) as ApiClientError;

    expect(error.code).toBe('TIMEOUT');
    expect(error.isRetryable).toBe(true);
  });

  it('flags non-JSON and mismatching responses as INVALID_RESPONSE', async () => {
    const html = stubFetch(() =>
      Promise.resolve(new Response('<html>oops</html>', { status: 502 })),
    );
    const htmlError = (await clientWith(html)
      .get('/health')
      .catch((e: unknown) => e)) as ApiClientError;
    expect(htmlError.code).toBe('INVALID_RESPONSE');
    expect(htmlError.status).toBe(502);

    const wrongShape = stubFetch(() => Promise.resolve(okResponse({ status: 'degraded' }, 'x')));
    const schemaError = (await clientWith(wrongShape)
      .get('/health', { schema: healthSchema })
      .catch((e: unknown) => e)) as ApiClientError;
    expect(schemaError.code).toBe('INVALID_RESPONSE');
  });

  it('handles 204 No Content', async () => {
    const fetchStub = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

    const result = await clientWith(fetchStub).delete('/places/1/save');

    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });
});
