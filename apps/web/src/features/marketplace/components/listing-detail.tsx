'use client';

import { ApiClientError } from '@platform/api-client';
import {
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITION_LABELS,
  LISTING_VISIBILITY_LABELS,
  MARKETPLACE_REPORT_REASONS,
  MESSAGE_MAX,
  type Listing,
  type ListingSellerAction,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ReportDialog } from '@/components/shared/report-dialog';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { MemberLine } from '@/features/community/components/member-line';
import { timeAgo } from '@/lib/format/time';
import { marketplaceService } from '@/services/marketplace.service';
import { safetyService } from '@/services/safety.service';
import { ListingImage, StatusPill, formatPrice } from './listing-card';

/** One listing: photos, details, the seller, and a way to message them (or manage it, if mine). */
export function ListingDetail({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);
  const [photo, setPhoto] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    marketplaceService
      .listing(listingId, controller.signal)
      .then((result) => {
        setListing(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          missing: caught instanceof ApiClientError && caught.status === 404,
          message: caught instanceof ApiClientError ? caught.message : 'Could not load listing.',
        });
      });
    return () => controller.abort();
  }, [listingId, reload]);

  if (error?.missing) {
    return (
      <EmptyState
        title="Listing not available"
        description="It was sold or removed, or it is not shown to your college."
        action={
          <Link
            href={ROUTES.marketplace}
            className="text-sm font-medium text-action hover:underline"
          >
            Back to the marketplace
          </Link>
        }
      />
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={() => setReload((n) => n + 1)} />;
  if (!listing) return <Skeleton className="h-[32rem] w-full" />;

  async function act(action: ListingSellerAction) {
    try {
      setListing((await marketplaceService.act(listingId, action)).data);
      setNotice(null);
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'That did not work.');
    }
  }

  async function remove() {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    try {
      await marketplaceService.remove(listingId);
      router.push(ROUTES.marketplaceMine);
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not delete.');
    }
  }

  async function block() {
    if (!listing) return;
    if (!window.confirm(`Block ${listing.seller.displayName}? You will stop seeing each other.`))
      return;
    try {
      await safetyService.block(listing.seller.id);
      router.push(ROUTES.marketplace);
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not block.');
    }
  }

  const photos = listing.images.length > 0 ? listing.images : [null];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={listing.mine ? ROUTES.marketplaceMine : ROUTES.marketplace}
        className="inline-flex items-center gap-1 text-sm font-medium text-action hover:underline"
      >
        <Icon name="arrowLeft" className="size-4" /> {listing.mine ? 'My listings' : 'Marketplace'}
      </Link>
      {notice && <FormAlert message={notice} />}
      {listing.status === 'HIDDEN' && (
        <p className="rounded-lg bg-accent-50 px-4 py-3 text-sm text-ink">
          A moderator hid this listing while they look into it
          {listing.moderationNote ? `: ${listing.moderationNote}` : '.'}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line">
            <ListingImage src={photos[photo] ?? null} alt={listing.title} />
            <span className="absolute left-3 top-3">
              <StatusPill status={listing.status} />
            </span>
          </div>
          {listing.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {listing.images.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`Photo ${index + 1}`}
                  aria-pressed={photo === index}
                  onClick={() => setPhoto(index)}
                  className={`size-16 shrink-0 overflow-hidden rounded-md border-2 ${
                    photo === index ? 'border-action' : 'border-transparent'
                  }`}
                >
                  <ListingImage src={url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-3xl font-bold text-ink">{formatPrice(listing.price)}</p>
            {listing.negotiable && listing.price > 0 && (
              <p className="text-sm text-muted">Price negotiable</p>
            )}
            <h1 className="text-xl font-bold text-ink">{listing.title}</h1>
            <p className="text-sm text-muted">
              {LISTING_CATEGORY_LABELS[listing.category]} ·{' '}
              {LISTING_CONDITION_LABELS[listing.condition]}
              {listing.quantity > 1 && ` · ${listing.quantity} available`} · listed{' '}
              {timeAgo(listing.createdAt)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
            <div>
              <dt className="text-muted">College</dt>
              <dd className="font-medium text-ink">{listing.college.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Distance</dt>
              <dd className="font-medium text-ink">
                {listing.distanceKm === null ? 'Your college' : `${listing.distanceKm} km away`}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Pickup</dt>
              <dd className="font-medium text-ink">{listing.location ?? 'Ask the seller'}</dd>
            </div>
            <div>
              <dt className="text-muted">Visible to</dt>
              <dd className="font-medium text-ink">
                {LISTING_VISIBILITY_LABELS[listing.visibility]}
              </dd>
            </div>
          </dl>

          <div className="rounded-xl border border-line bg-surface p-4">
            <MemberLine member={listing.seller} />
          </div>

          {listing.mine ? (
            <SellerActions listing={listing} onAct={act} onRemove={remove} />
          ) : (
            <BuyerBox listing={listing} onReport={() => setReporting(true)} onBlock={block} />
          )}
        </div>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-2 font-bold text-ink">Description</h2>
        <p className="whitespace-pre-line text-body">{listing.description}</p>
      </section>

      <ReportDialog
        open={reporting}
        title="Report this listing"
        reasons={MARKETPLACE_REPORT_REASONS}
        onClose={() => setReporting(false)}
        onSubmit={(dto) => marketplaceService.report(listing.id, dto)}
      />
    </div>
  );
}

function SellerActions({
  listing,
  onAct,
  onRemove,
}: {
  listing: Listing;
  onAct: (action: ListingSellerAction) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { status } = listing;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">
        This is your listing.{' '}
        {status === 'EXPIRED'
          ? 'It has expired — renew it to show it again.'
          : `It ends on ${new Date(listing.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {status === 'ACTIVE' && (
          <Button size="sm" variant="secondary" onClick={() => void onAct('reserve')}>
            Mark reserved
          </Button>
        )}
        {status === 'RESERVED' && (
          <Button size="sm" variant="secondary" onClick={() => void onAct('unreserve')}>
            Available again
          </Button>
        )}
        {(status === 'ACTIVE' || status === 'RESERVED') && (
          <Button size="sm" onClick={() => void onAct('sold')}>
            Mark sold
          </Button>
        )}
        {(status === 'ACTIVE' || status === 'RESERVED' || status === 'EXPIRED') && (
          <Button size="sm" variant="secondary" onClick={() => void onAct('renew')}>
            Renew 30 days
          </Button>
        )}
        {status !== 'HIDDEN' && status !== 'SOLD' && (
          <Link
            href={ROUTES.marketplaceEdit(listing.id)}
            className="inline-flex h-9 items-center rounded-md border border-control px-3 text-sm font-medium text-ink hover:bg-subtle"
          >
            Edit
          </Link>
        )}
        <Button size="sm" variant="ghost" onClick={() => void onRemove()}>
          Delete
        </Button>
      </div>
      <Link href={ROUTES.messages} className="text-sm font-medium text-action hover:underline">
        See messages from buyers
      </Link>
    </div>
  );
}

function BuyerBox({
  listing,
  onReport,
  onBlock,
}: {
  listing: Listing;
  onReport: () => void;
  onBlock: () => Promise<void>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('Hi! Is this still available?');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await marketplaceService.message(listing.id, message.trim());
      router.push(ROUTES.conversation(result.data.id));
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not send.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      {listing.conversationId ? (
        <Link
          href={ROUTES.conversation(listing.conversationId)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover"
        >
          <Icon name="chat" className="size-4" /> Open my conversation
        </Link>
      ) : listing.canMessage ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <label htmlFor="first-message" className="text-sm font-medium text-ink">
            Message the seller
          </label>
          <textarea
            id="first-message"
            rows={3}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink"
          />
          {problem && <p className="text-sm text-danger-700">{problem}</p>}
          <Button type="submit" loading={busy}>
            Send message
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">
          {listing.status === 'SOLD'
            ? 'This item has been sold.'
            : 'The seller is not taking messages right now.'}
        </p>
      )}
      <p className="flex items-start gap-2 text-xs text-muted">
        <Icon name="shield" className="mt-0.5 size-4 shrink-0" />
        Meet in a public place on campus, check the item before paying, and never pay in advance to
        someone you have not met.
      </p>
      <div className="flex gap-3 text-xs">
        <button type="button" className="text-muted hover:text-ink" onClick={onReport}>
          Report listing
        </button>
        <button type="button" className="text-muted hover:text-ink" onClick={() => void onBlock()}>
          Block seller
        </button>
      </div>
    </div>
  );
}
