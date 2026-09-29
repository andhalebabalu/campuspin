'use client';

import { ApiClientError } from '@platform/api-client';
import {
  FINAL_REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  type Redemption,
  type ServiceRequest,
} from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { CodeDialog } from '@/features/offers/components/offer-card';
import { openPrivateFile } from '@/features/files/private-file';
import { engagementService } from '@/services/engagement.service';

export function requestTone(request: Pick<ServiceRequest, 'status'>): BadgeTone {
  if (request.status === 'ESTIMATE_AVAILABLE' || request.status === 'READY') return 'success';
  if (request.status === 'CANCELLED' || request.status === 'REJECTED') return 'danger';
  if (request.status === 'COMPLETED') return 'neutral';
  return 'accent';
}

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function RequestCard({ request }: { request: ServiceRequest }) {
  return (
    <Link href={ROUTES.request(request.id)} className="block">
      <Card hover className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {request.label} · {request.place.name}
          </p>
          <p className="text-sm text-body">
            {request.code}
            {request.table ? ` · ${request.table}` : ''}
            {request.estimateAmount !== null ? ` · estimate ₹${request.estimateAmount}` : ''}
          </p>
          <p className="text-xs text-muted">{dateTime.format(new Date(request.createdAt))}</p>
        </div>
        <Badge tone={requestTone(request)}>{request.statusLabel}</Badge>
      </Card>
    </Link>
  );
}

function usePagedList<T>(load: (page: number, signal: AbortSignal) => Promise<{ data: T[] }>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(1, controller.signal)
      .then((result) => {
        setItems(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load this list.');
      });
    return () => controller.abort();
  }, [load, reload]);
  return { items, error, retry: () => setReload((count) => count + 1) };
}

/** The student's requests (table requests and jobs), newest first. */
export function MyRequestsList() {
  const load = useCallback(
    (page: number, signal: AbortSignal) => engagementService.myRequests({ page }, signal),
    [],
  );
  const { items, error, retry } = usePagedList(load);
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!items) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No requests yet"
        description="Call the staff from your table, or ask a repair shop or laundry to take a job."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((request) => (
        <li key={request.id}>
          <RequestCard request={request} />
        </li>
      ))}
    </ul>
  );
}

/** The student's offer codes and uses. */
export function MyRedemptionsList() {
  const load = useCallback(
    (page: number, signal: AbortSignal) => engagementService.myRedemptions(page, signal),
    [],
  );
  const { items, error, retry } = usePagedList(load);
  const [showing, setShowing] = useState<Redemption | null>(null);
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!items) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No offers used yet"
        description="Get a code from a student offer and show it at the counter."
        action={
          <Link href={ROUTES.offers} className="text-sm font-semibold text-primary-700">
            See offers
          </Link>
        }
      />
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold text-ink">
                  {item.offer.headline} · {item.place.name}
                </p>
                <p className="text-sm text-body">
                  {item.offer.title}
                  {item.discountAmount > 0 ? ` · saved ₹${item.discountAmount}` : ''}
                </p>
              </div>
              {item.status === 'ISSUED' ? (
                <Button size="sm" onClick={() => setShowing(item)}>
                  Show code
                </Button>
              ) : (
                <Badge tone={item.status === 'REDEEMED' ? 'success' : 'neutral'}>
                  {item.status === 'REDEEMED' ? 'Used' : 'Expired'}
                </Badge>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {showing && <CodeDialog redemption={showing} onClose={() => setShowing(null)} />}
    </>
  );
}

/** One request with its timeline and estimate; approve or cancel. Refreshes while open. */
export function RequestTracking({ requestId }: { requestId: string }) {
  const toast = useToast();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'approve' | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      engagementService
        .myRequest(requestId, signal)
        .then((result) => {
          setRequest(result.data);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (!signal?.aborted)
            setError(caught instanceof Error ? caught : new Error('Could not load the request.'));
        }),
    [requestId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const finished = request ? FINAL_REQUEST_STATUSES.includes(request.status) : false;
  useEffect(() => {
    if (!request || finished) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10_000);
    return () => clearInterval(timer);
  }, [request, finished, load]);

  if (error && !request) {
    if (error instanceof ApiClientError && error.status === 404)
      return <EmptyState title="Request not found" />;
    return <ErrorState message={error.message} onRetry={() => void load()} />;
  }
  if (!request) return <Skeleton className="h-80 w-full" />;

  async function act(kind: 'cancel' | 'approve') {
    if (kind === 'cancel' && !window.confirm('Cancel this request?')) return;
    setBusy(kind);
    try {
      const result =
        kind === 'cancel'
          ? await engagementService.cancelRequest(requestId)
          : await engagementService.approveEstimate(requestId);
      setRequest(result.data);
      toast.show(kind === 'cancel' ? 'Request cancelled' : 'Estimate approved: the work can start');
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not update.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              {request.code} · {request.service.name}
            </p>
            <h1 className="text-2xl font-bold text-ink">{request.label}</h1>
            <Link
              href={ROUTES.placeDetail(request.place.slug)}
              className="text-sm text-primary-700 hover:underline"
            >
              {request.place.name}
              {request.table ? ` · ${request.table}` : ''}
            </Link>
          </div>
          <Badge tone={requestTone(request)}>{request.statusLabel}</Badge>
        </div>
        {request.description && (
          <p className="whitespace-pre-line text-sm text-body">{request.description}</p>
        )}
        {request.hasImage && !finished && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              void openPrivateFile(() => engagementService.myRequestPhoto(request.id)).catch(() =>
                toast.show('The photo is no longer stored.', 'error'),
              )
            }
          >
            <Icon name="image" className="size-4" /> My photo
          </Button>
        )}
        {request.statusReason && (
          <p className="text-sm text-muted">Note from the business: {request.statusReason}</p>
        )}
        {!finished && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Icon name="clock" className="size-4" /> Updates automatically
          </p>
        )}
      </Card>

      {request.estimateAmount !== null && (
        <Card className="flex flex-col gap-2 border-accent-600 p-6">
          <p className="text-sm font-semibold text-accent-700">Estimate</p>
          <p className="text-3xl font-bold text-ink">₹{request.estimateAmount}</p>
          {request.estimateNote && <p className="text-sm text-body">{request.estimateNote}</p>}
          {request.canApprove && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button loading={busy === 'approve'} onClick={() => void act('approve')}>
                Approve estimate
              </Button>
              <Button
                variant="secondary"
                loading={busy === 'cancel'}
                onClick={() => void act('cancel')}
              >
                Decline and cancel
              </Button>
            </div>
          )}
          <p className="text-xs text-muted">You pay the business directly when the work is done.</p>
        </Card>
      )}

      {request.history.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-3 font-semibold text-ink">Timeline</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {request.history.map((entry) => (
              <li key={`${entry.status}-${entry.at}`} className="flex justify-between">
                <span className="text-ink">{REQUEST_STATUS_LABELS[entry.status]}</span>
                <span className="text-muted">{dateTime.format(new Date(entry.at))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {request.canCancel && !request.canApprove && (
        <Button
          variant="secondary"
          className="self-start"
          loading={busy === 'cancel'}
          onClick={() => void act('cancel')}
        >
          Cancel request
        </Button>
      )}
    </div>
  );
}
