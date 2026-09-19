'use client';

import { ApiClientError } from '@platform/api-client';
import { useCallback, useEffect, useState } from 'react';
import { env } from '@/lib/env';
import { healthService } from '@/services/health.service';

type CheckState =
  | { phase: 'loading' }
  | { phase: 'ok'; message: string; detail?: string; ms: number }
  | { phase: 'error'; message: string; code: string; requestId?: string };

const INITIAL: CheckState = { phase: 'loading' };

function toError(error: unknown): CheckState {
  if (error instanceof ApiClientError) {
    return {
      phase: 'error',
      message: error.message,
      code: error.code,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  return { phase: 'error', message: 'Unexpected error.', code: 'UNKNOWN' };
}

/** Runs one health request through the centralized client and tracks its state. */
function useHealthCheck(
  run: (signal: AbortSignal) => Promise<{ message: string; detail?: string }>,
) {
  const [state, setState] = useState<CheckState>(INITIAL);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = performance.now();
    run(controller.signal)
      .then((result) =>
        setState({ phase: 'ok', ...result, ms: Math.round(performance.now() - startedAt) }),
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState(toError(error));
      });
    return () => controller.abort();
  }, [run, attempt]);

  const retry = useCallback(() => {
    setState(INITIAL);
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}

const checkApi = async (signal: AbortSignal) => {
  const result = await healthService.check(signal);
  return { message: result.message, detail: `status: ${result.data.status}` };
};

const checkDatabase = async (signal: AbortSignal) => {
  const result = await healthService.checkDatabase(signal);
  return {
    message: result.message,
    detail: `${result.data.database} on ${result.data.serverVersion}`,
  };
};

function Row({
  label,
  endpoint,
  state,
  onRetry,
  pendingHint,
}: {
  label: string;
  endpoint: string;
  state: CheckState;
  onRetry: () => void;
  /** Shown for the "expected until a later phase" failure so it does not read as a bug. */
  pendingHint?: string;
}) {
  const tone =
    state.phase === 'ok'
      ? { dot: 'bg-success-600', text: 'text-success-700', label: 'Operational' }
      : state.phase === 'loading'
        ? { dot: 'bg-neutral-400 animate-pulse', text: 'text-muted', label: 'Checking…' }
        : { dot: 'bg-danger-600', text: 'text-danger-700', label: 'Unavailable' };

  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="sm:w-56 sm:shrink-0">
        <p className="font-medium text-ink">{label}</p>
        <p className="mt-0.5 font-mono text-sm break-all text-muted">GET {endpoint}</p>
      </div>

      <div
        className="flex min-w-0 flex-col gap-1 sm:flex-1 sm:items-end sm:text-right"
        role="status"
        aria-live="polite"
      >
        <span className={`inline-flex items-center gap-2 text-sm font-medium ${tone.text}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </span>

        {state.phase === 'ok' && (
          <span className="text-sm text-body">
            {state.message}
            {state.detail ? ` · ${state.detail}` : ''} · {state.ms} ms
          </span>
        )}

        {state.phase === 'error' && (
          <>
            <span className="text-sm text-body">{state.message}</span>
            <span className="text-sm text-muted">
              Code: {state.code}
              {state.requestId ? ` · Request: ${state.requestId.slice(0, 8)}` : ''}
            </span>
            {pendingHint && <span className="text-sm text-accent-700">{pendingHint}</span>}
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex h-9 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Development diagnostics: proves the browser can reach the NestJS API (CORS, base URL) and
 * whether the API can reach MySQL. This is replaced by real product UI in later phases.
 */
export function ApiStatus() {
  const api = useHealthCheck(checkApi);
  const database = useHealthCheck(checkDatabase);

  return (
    <section
      aria-labelledby="system-status-heading"
      className="rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 id="system-status-heading" className="text-lg font-semibold">
          System status
        </h2>
        <span className="font-mono text-xs break-all text-muted">{env.NEXT_PUBLIC_API_URL}</span>
      </div>

      <ul className="mt-2 divide-y divide-line">
        <Row label="API" endpoint="/health" state={api.state} onRetry={api.retry} />
        <Row
          label="Database (XAMPP MySQL)"
          endpoint="/health/database"
          state={database.state}
          onRetry={database.retry}
          pendingHint="Expected until the database is created in the next phase."
        />
      </ul>
    </section>
  );
}
