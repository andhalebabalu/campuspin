'use client';

import { ApiClientError } from '@platform/api-client';
import type { PageMeta } from '@platform/contracts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Shared bits of the admin screens: header, filters row, pagination, reason dialog, list loading. */

export const SELECT_CLASSES =
  'h-10 rounded-md border border-control bg-surface px-3 text-sm text-ink';
export const SEARCH_CLASSES =
  'h-10 min-w-0 rounded-md border border-control bg-surface px-3 text-sm text-ink placeholder:text-muted';
export const PRIMARY_LINK_CLASSES =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-medium text-white transition-colors hover:bg-action-hover';

export const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

export function AdminHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="text-sm text-body">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pagination({
  meta,
  page,
  onPage,
}: {
  meta: PageMeta | null;
  page: number;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) {
    return meta ? <p className="mt-4 text-sm text-muted">{meta.total} in total</p> : null;
  }
  return (
    <div className="mt-4 flex items-center justify-between">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted">
        Page {meta.page} of {meta.totalPages} · {meta.total} in total
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= meta.totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof ApiClientError ? caught.message : fallback;
}

/**
 * Loads a list for the current filters and re-loads when they change (or after `reload()`).
 * `load` must be stable per filter set: pass the filters in `deps`.
 */
export function useAdminList<T>(
  load: (signal: AbortSignal) => Promise<{ data: T[]; meta?: PageMeta }>,
  deps: readonly unknown[],
) {
  const [items, setItems] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    loadRef
      .current(controller.signal)
      .then((result) => {
        setItems(result.data);
        setMeta(result.meta ?? null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          message: errorMessage(caught, 'Could not load this list.'),
          requestId: caught instanceof ApiClientError ? caught.requestId : undefined,
        });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` are the caller's filters.
  }, [...deps, tick]);

  /** Replace one row in place (after an action returned the updated item). */
  function replace(match: (item: T) => boolean, next: T) {
    setItems((current) => (current ? current.map((item) => (match(item) ? next : item)) : current));
  }

  return { items, meta, error, reload: () => setTick((value) => value + 1), replace };
}

export interface ReasonRequest {
  title: string;
  description?: string;
  confirmLabel: string;
  /** A required reason must be at least one character. */
  required: boolean;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

/**
 * A small modal asking for a (required or optional) reason before a moderation action. Every such
 * reason is stored in the audit log, and some (rejections, hidden reviews) are shown to the author.
 */
export function ReasonDialog({
  request,
  onClose,
}: {
  request: ReasonRequest | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  async function confirm() {
    if (!request) return;
    if (request.required && reason.trim() === '') {
      setProblem('Please give a reason.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await request.onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (caught) {
      setProblem(errorMessage(caught, 'That did not work. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        setReason('');
        setProblem(null);
        onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      {request && (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
          className="flex flex-col gap-4 p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{request.title}</h2>
            {request.description && <p className="text-sm text-body">{request.description}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              Reason {request.required ? '' : '(optional)'}
            </label>
            <textarea
              id={inputId}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-md border border-control bg-surface px-3 py-2 text-sm"
            />
          </div>
          {problem && <p className="text-sm text-danger-700">{problem}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant={request.danger ? 'danger' : 'primary'} loading={busy}>
              {request.confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
