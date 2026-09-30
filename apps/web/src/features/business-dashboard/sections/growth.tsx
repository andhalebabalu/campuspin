'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { BRAND } from '@/constants/brand';
import { DailyBars, Delta, ShareBars } from '@/components/shared/charts';
import { ACTION_ROWS, useAnalytics } from '../use-analytics';
import { useWorkspace } from '../workspace';
import { EmptyAnalytics, Panel } from './overview';
import { PublicLinkCard, publicUrlOf } from './public-link';

const RANGES = [7, 30, 90] as const;

export function AnalyticsSection() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error, retry } = useAnalytics(days);
  const noEvents = data ? Object.values(data.totals).every((value) => value === 0) : false;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How students find and contact you, counted from real visits. Nobody's identity is recorded."
        actions={
          <div role="tablist" aria-label="Period" className="flex rounded-xl bg-subtle p-1">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={days === range}
                onClick={() => setDays(range)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === range ? 'bg-surface text-ink shadow-xs' : 'text-body'}`}
              >
                {range} days
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[{ key: 'PAGE_VIEW', label: 'Page views' } as const, ...ACTION_ROWS].map((row) => (
              <div
                key={row.key}
                className="rounded-2xl border border-line bg-surface p-4 shadow-xs"
              >
                <p className="text-sm text-body">{row.label}</p>
                <p className="mt-1 text-2xl font-bold text-ink">{data.totals[row.key]}</p>
                <Delta now={data.totals[row.key]} before={data.previousTotals[row.key]} />
              </div>
            ))}
          </div>
          <Panel title={`Page views — last ${days} days`}>
            {noEvents ? (
              <EmptyAnalytics />
            ) : (
              <DailyBars
                days={data.daily.map((day) => ({ day: day.day, value: day.PAGE_VIEW }))}
                label={`Page views, last ${days} days`}
              />
            )}
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Customer actions">
              {noEvents ? (
                <p className="text-sm text-muted">No taps yet in this period.</p>
              ) : (
                <ShareBars
                  rows={ACTION_ROWS.map((row) => ({
                    label: row.label,
                    value: data.totals[row.key],
                    color: row.color,
                  }))}
                />
              )}
            </Panel>
            <Panel title="Reviews & enquiries">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-body">New reviews</dt>
                  <dd className="text-2xl font-bold text-ink">{data.reviews.inPeriod}</dd>
                  <dd className="text-xs text-muted">{data.reviews.count} in total</dd>
                </div>
                <div>
                  <dt className="text-sm text-body">Enquiries</dt>
                  <dd className="text-2xl font-bold text-ink">{data.enquiries.inPeriod}</dd>
                  <dd className="text-xs text-muted">in this period</dd>
                </div>
              </dl>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

/** Share kit: the link, a ready WhatsApp message, and a QR code to print or post. */
export function ShareSection() {
  const toast = useToast();
  const { dashboard } = useWorkspace();
  const { profile } = dashboard;
  const url = publicUrlOf(profile.slug);
  const message = `Hi! ${profile.businessName} is now on ${BRAND.name}. See our photos, timings and reviews, and call or WhatsApp us: ${url}`;
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 720 }).then(
      (data) => {
        if (!cancelled) setQr({ url, data });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(done);
    } catch {
      toast.show('Could not copy. Select the text and copy it.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Share your page"
        description="Every visit counts. Put your link where your customers already are."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <PublicLinkCard />
          <Panel title="Message for WhatsApp groups and status">
            <p className="rounded-xl bg-subtle p-4 text-sm text-ink">{message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copy(message, 'Message copied')}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-subtle"
              >
                <Icon name="copy" className="size-4" /> Copy message
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-650"
              >
                <Icon name="whatsapp" className="size-4" /> Send on WhatsApp
              </a>
            </div>
          </Panel>
          <Panel title="Where to share">
            <ul className="flex flex-col gap-3 text-sm text-body">
              <li className="flex gap-3">
                <Icon name="instagram" className="mt-0.5 size-4 text-muted" /> Add the link to your
                Instagram bio and stories (use a link sticker).
              </li>
              <li className="flex gap-3">
                <Icon name="whatsapp" className="mt-0.5 size-4 text-muted" /> Post it on your
                WhatsApp Business profile and status.
              </li>
              <li className="flex gap-3">
                <Icon name="qr" className="mt-0.5 size-4 text-muted" /> Print the QR code at your
                counter, on menus and flyers.
              </li>
            </ul>
          </Panel>
        </div>
        <Panel title="QR code">
          {!profile.isPublic && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
              The code works once your page is live.
            </p>
          )}
          {qr?.url === url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL. */}
              <img
                src={qr.data}
                alt={`QR code for ${url}`}
                className="mx-auto w-full max-w-64 rounded-xl border border-line"
              />
              <a
                href={qr.data}
                download={`${profile.slug}-campuspin-qr.png`}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-action text-sm font-semibold text-white hover:bg-action-hover"
              >
                <Icon name="download" className="size-4" /> Download PNG
              </a>
            </>
          ) : (
            <Skeleton className="aspect-square w-full" />
          )}
        </Panel>
      </div>
    </>
  );
}
