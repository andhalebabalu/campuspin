'use client';

import { ApiClientError } from '@platform/api-client';
import {
  LEAD_STATUSES,
  type BusinessLead,
  type BusinessListing,
  type LeadStatus,
  type PageMeta,
} from '@platform/contracts';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { businessService } from '@/services/business.service';
import { LEAD_STATUS, dateTimeFormat } from '../lib/labels';

const SELECT_CLASSES = 'h-10 rounded-md border border-control bg-surface px-3 text-sm text-ink';

/**
 * The enquiry inbox: filter by status and listing, change an enquiry's status, and reach the
 * student by phone or email. `onChanged` lets the dashboard refresh its "new" counters.
 */
export function EnquiriesPanel({
  listings,
  placeId,
  onPlaceChange,
  onChanged,
}: {
  listings: BusinessListing[];
  placeId: string;
  onPlaceChange: (placeId: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [page, setPage] = useState(1);
  const [leads, setLeads] = useState<BusinessLead[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    businessService
      .enquiries(
        { page, ...(status ? { status } : {}), ...(placeId ? { placeId } : {}) },
        controller.signal,
      )
      .then((result) => {
        setLeads(result.data);
        setMeta(result.meta ?? null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load enquiries.' },
        );
      });
    return () => controller.abort();
  }, [status, placeId, page, reload]);

  async function changeStatus(lead: BusinessLead, next: LeadStatus) {
    setSaving(lead.id);
    try {
      const result = await businessService.updateEnquiry(lead.id, next);
      setLeads((current) =>
        current ? current.map((row) => (row.id === lead.id ? result.data : row)) : current,
      );
      onChanged();
    } catch (caught) {
      setError({
        message:
          caught instanceof ApiClientError ? caught.message : 'Could not update the enquiry.',
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as LeadStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {LEAD_STATUS[value].label}
            </option>
          ))}
        </select>
        {listings.length > 1 && (
          <select
            aria-label="Filter by listing"
            value={placeId}
            onChange={(event) => {
              onPlaceChange(event.target.value);
              setPage(1);
            }}
            className={`${SELECT_CLASSES} max-w-64`}
          >
            <option value="">All listings</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setReload((count) => count + 1)}
        />
      ) : leads === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          title={status || placeId ? 'No enquiries match' : 'No enquiries yet'}
          description="When a student asks about one of your live listings, it shows up here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-semibold text-ink">{lead.student.name}</p>
                    <p className="text-sm text-muted">
                      About <span className="font-medium text-body">{lead.place.name}</span> ·{' '}
                      {dateTimeFormat.format(new Date(lead.createdAt))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={LEAD_STATUS[lead.status].tone}>
                      {LEAD_STATUS[lead.status].label}
                    </Badge>
                    <select
                      aria-label={`Status of the enquiry from ${lead.student.name}`}
                      value={lead.status}
                      disabled={saving === lead.id}
                      onChange={(event) =>
                        void changeStatus(lead, event.target.value as LeadStatus)
                      }
                      className={SELECT_CLASSES}
                    >
                      {LEAD_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {LEAD_STATUS[value].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="whitespace-pre-line text-body">{lead.message}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {lead.contactPhone && (
                    <a
                      href={`tel:${lead.contactPhone.replace(/[^\d+]/g, '')}`}
                      className="font-medium text-action hover:text-action-hover"
                    >
                      Call {lead.contactPhone}
                    </a>
                  )}
                  <a
                    href={`mailto:${lead.student.email}`}
                    className="font-medium text-action hover:text-action-hover"
                  >
                    Email {lead.student.email}
                  </a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
