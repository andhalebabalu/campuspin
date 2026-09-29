'use client';

import { ApiClientError } from '@platform/api-client';
import {
  REQUEST_STATUS_LABELS,
  type BusinessListing,
  type BusinessServiceRequest,
  type OwnerTableRequestType,
  type RequestStatus,
} from '@platform/contracts';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { requestTone } from '@/features/requests/components/request-views';
import { openPrivateFile } from '@/features/files/private-file';
import { engagementService } from '@/services/engagement.service';
import { PlacePicker } from './place-picker';

const POLL_MS = 5_000;

const ACTION: Record<RequestStatus, string> = {
  NEW: '',
  ACKNOWLEDGED: 'On my way',
  ACCEPTED: 'Accept',
  DIAGNOSING: 'Checking it',
  ESTIMATE_AVAILABLE: 'Send estimate',
  APPROVED: '',
  IN_PROGRESS: 'Start work',
  READY: 'Mark ready',
  COMPLETED: 'Done',
  CANCELLED: 'Cancel',
  REJECTED: 'Decline',
};

function minutesAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function RequestTicket({
  request,
  onChanged,
}: {
  request: BusinessServiceRequest;
  onChanged: (next: BusinessServiceRequest) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<RequestStatus | null>(null);

  async function move(status: RequestStatus) {
    let body: {
      status: RequestStatus;
      reason?: string;
      estimateAmount?: number;
      estimateNote?: string;
    } = { status };
    if (status === 'ESTIMATE_AVAILABLE') {
      const amount = window.prompt('Estimate in rupees:', '');
      if (amount === null) return;
      const value = Math.round(Number(amount));
      if (!Number.isFinite(value) || value < 0) {
        toast.show('Enter the estimate in whole rupees', 'error');
        return;
      }
      const note = window.prompt('Anything the student should know? (optional)', '') ?? '';
      body = {
        status,
        estimateAmount: value,
        ...(note.trim() ? { estimateNote: note.trim() } : {}),
      };
    }
    if (status === 'REJECTED' || status === 'CANCELLED') {
      const reason = window.prompt('Tell the student why (optional):', '');
      if (reason === null) return;
      if (reason.trim()) body = { status, reason: reason.trim() };
    }
    setBusy(status);
    try {
      const result = await engagementService.updateRequest(request.id, body);
      onChanged(result.data);
      toast.show(`${request.label}: ${REQUEST_STATUS_LABELS[status]}`);
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not update.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const stop = (status: RequestStatus) => status === 'REJECTED' || status === 'CANCELLED';
  return (
    <Card
      className={`flex flex-col gap-3 p-4 ${request.status === 'NEW' ? 'border-amber-600 ring-1 ring-amber-600/30' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-ink">
            {request.kind === 'TABLE' ? `${request.table}: ${request.label}` : request.label}
          </p>
          <p className="text-xs text-muted">
            {request.code} · {request.student.name} · {minutesAgo(request.createdAt)}
          </p>
        </div>
        <Badge tone={requestTone(request)}>{request.statusLabel}</Badge>
      </div>
      {request.description && (
        <p className="whitespace-pre-line text-sm text-body">{request.description}</p>
      )}
      {request.hasImage && (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() =>
            void openPrivateFile(() => engagementService.businessRequestPhoto(request.id)).catch(
              () => toast.show('The photo is no longer stored.', 'error'),
            )
          }
        >
          <Icon name="image" className="size-4" /> View photo
        </Button>
      )}
      {request.preferredAt && (
        <p className="text-sm text-body">
          Preferred: {new Date(request.preferredAt).toLocaleString('en-IN')}
        </p>
      )}
      {request.estimateAmount !== null && (
        <p className="text-sm text-ink">
          Estimate ₹{request.estimateAmount}
          {request.status === 'ESTIMATE_AVAILABLE' ? ' · waiting for the student' : ''}
        </p>
      )}
      {request.nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {request.nextStatuses
            .filter((status) => !stop(status))
            .map((status) => (
              <Button
                key={status}
                size="sm"
                loading={busy === status}
                onClick={() => void move(status)}
              >
                {ACTION[status]}
              </Button>
            ))}
          {request.nextStatuses.filter(stop).map((status) => (
            <Button
              key={status}
              size="sm"
              variant="ghost"
              loading={busy === status}
              onClick={() => void move(status)}
            >
              {ACTION[status]}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

function TableRequestMenu({ listings }: { listings: BusinessListing[] }) {
  const toast = useToast();
  const [placeId, setPlaceId] = useState('');
  const [loaded, setLoaded] = useState<{ placeId: string; types: OwnerTableRequestType[] } | null>(
    null,
  );
  const [label, setLabel] = useState('');
  const types = loaded?.placeId === placeId ? loaded.types : null;

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    engagementService
      .requestTypes(placeId, controller.signal)
      .then((result) => setLoaded({ placeId, types: result.data }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [placeId]);

  async function run(action: () => Promise<{ data: OwnerTableRequestType[] }>, message: string) {
    try {
      setLoaded({ placeId, types: (await action()).data });
      toast.show(message);
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not save.', 'error');
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">What students can ask for from a table</p>
          <p className="text-sm text-body">
            Shown when a student scans a table QR code (switch on Table Service under Services).
          </p>
        </div>
        <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
      </div>
      {!types ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {types.map((type) => (
              <li
                key={type.id}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${type.active ? 'border-line text-ink' : 'border-dashed border-line text-muted'}`}
              >
                {type.label}
                <button
                  type="button"
                  className="ml-1 text-xs text-primary-700 hover:underline"
                  onClick={() =>
                    void run(
                      () =>
                        engagementService.updateRequestType(placeId, type.id, {
                          active: !type.active,
                        }),
                      type.active ? 'Hidden' : 'Shown',
                    )
                  }
                >
                  {type.active ? 'hide' : 'show'}
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-danger-700"
                  onClick={() =>
                    void run(() => engagementService.deleteRequestType(placeId, type.id), 'Removed')
                  }
                >
                  <Icon name="close" className="size-3.5" label={`Remove ${type.label}`} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!label.trim()) return;
              void run(
                () =>
                  engagementService.addRequestType(placeId, {
                    label: label.trim(),
                    active: true,
                    sortOrder: types.length,
                  }),
                'Added',
              ).then(() => setLabel(''));
            }}
          >
            <input
              value={label}
              maxLength={40}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Hot water"
              aria-label="New table request"
              className="h-10 flex-1 rounded-md border border-control px-3 text-sm"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!label.trim()}>
              Add
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

/** The request inbox (table requests and jobs, polled every 5 s) and the table request menu. */
export function RequestsPanel({ listings }: { listings: BusinessListing[] }) {
  const [scope, setScope] = useState<'active' | 'today' | 'all'>('active');
  const [loaded, setLoaded] = useState<{ scope: string; items: BusinessServiceRequest[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const items = loaded?.scope === scope ? loaded.items : null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await engagementService.businessRequests({ scope }, signal);
        setLoaded({ scope, items: result.data });
        setError(null);
      } catch (caught) {
        if (!signal?.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load requests.');
      }
    },
    [scope],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        {(['active', 'today', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${scope === value ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-line text-body hover:bg-subtle'}`}
          >
            {value === 'active' ? 'Open' : value === 'today' ? 'Today' : 'All'}
          </button>
        ))}
      </div>
      {error && !items ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={scope === 'active' ? 'No open requests' : 'No requests yet'}
          description="Table requests and repair or laundry jobs appear here within seconds."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((request) => (
            <RequestTicket
              key={request.id}
              request={request}
              onChanged={(next) =>
                setLoaded((state) =>
                  state
                    ? {
                        ...state,
                        items: state.items.map((item) => (item.id === next.id ? next : item)),
                      }
                    : state,
                )
              }
            />
          ))}
        </div>
      )}
      {listings.length > 0 && <TableRequestMenu listings={listings} />}
    </div>
  );
}
