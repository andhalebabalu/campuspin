import { apiErrorSchema, type ApiSuccess, type PageMeta } from '@platform/contracts';
import type { z } from 'zod';
import { ApiClientError } from './errors.js';

type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;

export interface ApiClientOptions {
  /** Absolute base URL including the version prefix, e.g. `http://localhost:3001/api/v1`. */
  baseUrl: string;
  /** Returns the current access token (or null when signed out). Called before every request. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Sent on every request, e.g. `{ 'X-Client': 'web' }`. */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds. Default 15 000. */
  timeoutMs?: number;
  /** Override for tests or non-browser runtimes. */
  fetch?: typeof fetch;
}

export interface RequestOptions<TSchema extends z.ZodType | undefined = undefined> {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** When provided, `data` in the response is validated against it. */
  schema?: TSchema;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Extra `fetch` init, e.g. Next.js `{ next: { revalidate: 300, tags: ['place:abc'] } }`. */
  init?: RequestInit & Record<string, unknown>;
}

type DataOf<TSchema> = TSchema extends z.ZodType ? z.output<TSchema> : unknown;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiClient {
  get<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options?: Omit<RequestOptions<TSchema>, 'body'>,
  ): Promise<ApiSuccess<DataOf<TSchema>>>;
  post<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options?: RequestOptions<TSchema>,
  ): Promise<ApiSuccess<DataOf<TSchema>>>;
  put<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options?: RequestOptions<TSchema>,
  ): Promise<ApiSuccess<DataOf<TSchema>>>;
  patch<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options?: RequestOptions<TSchema>,
  ): Promise<ApiSuccess<DataOf<TSchema>>>;
  delete<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options?: Omit<RequestOptions<TSchema>, 'body'>,
  ): Promise<ApiSuccess<DataOf<TSchema>>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\/+/, ''), base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return url.toString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<TSchema extends z.ZodType | undefined>(
    method: Method,
    path: string,
    opts: RequestOptions<TSchema> = {},
  ): Promise<ApiSuccess<DataOf<TSchema>>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.defaultHeaders,
      ...opts.headers,
    };
    const token = await options.getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    // Portable timeout + caller cancellation (AbortSignal.any is not available everywhere).
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (opts.signal?.aborted) controller.abort();

    let response: Response;
    try {
      response = await doFetch(buildUrl(options.baseUrl, path, opts.query), {
        ...opts.init,
        method,
        headers,
        body: opts.body === undefined ? null : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new ApiClientError({
        message: timedOut ? 'The request timed out.' : 'Could not reach the server.',
        status: 0,
        code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        cause,
      });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }

    const requestIdHeader = response.headers.get('x-request-id') ?? undefined;
    const text = await response.text();

    if (response.status === 204 || (response.ok && text === '')) {
      return { success: true, message: '', data: undefined as DataOf<TSchema> };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (cause) {
      throw new ApiClientError({
        message: `The server returned an unreadable response (HTTP ${response.status}).`,
        status: response.status,
        code: 'INVALID_RESPONSE',
        requestId: requestIdHeader,
        cause,
      });
    }

    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(json);
      if (parsedError.success) {
        const body = parsedError.data;
        throw new ApiClientError({
          message: body.message,
          status: response.status,
          code: body.error.code,
          details: body.error.details,
          requestId: body.requestId ?? requestIdHeader,
        });
      }
      throw new ApiClientError({
        message: `Request failed (HTTP ${response.status}).`,
        status: response.status,
        code: 'INVALID_RESPONSE',
        requestId: requestIdHeader,
      });
    }

    if (!isPlainObject(json) || json.success !== true || !('data' in json)) {
      throw new ApiClientError({
        message: 'The server response did not match the expected format.',
        status: response.status,
        code: 'INVALID_RESPONSE',
        requestId: requestIdHeader,
      });
    }

    let data: unknown = json.data;
    if (opts.schema) {
      const validated = opts.schema.safeParse(data);
      if (!validated.success) {
        throw new ApiClientError({
          message: 'The server response did not match the expected format.',
          status: response.status,
          code: 'INVALID_RESPONSE',
          details: { issues: validated.error.issues.map((issue) => issue.message) },
          requestId: requestIdHeader,
        });
      }
      data = validated.data;
    }

    return {
      success: true,
      message: typeof json.message === 'string' ? json.message : '',
      data: data as DataOf<TSchema>,
      ...(isPlainObject(json.meta) ? { meta: json.meta as unknown as PageMeta } : {}),
    };
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}
