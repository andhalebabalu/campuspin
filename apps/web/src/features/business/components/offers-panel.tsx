'use client';

import { ApiClientError } from '@platform/api-client';
import {
  EVERY_DAY,
  WEEKDAYS,
  offerHeadline,
  type BusinessListing,
  type BusinessRedemption,
  type DiscountType,
  type LimitPeriod,
  type OwnerOffer,
} from '@platform/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { validityText } from '@/features/offers/components/offer-card';
import { indiaDate } from '@/features/services/lib/service-meta';
import { engagementService } from '@/services/engagement.service';
import { PlacePicker } from './place-picker';

const INPUT = 'h-10 rounded-md border border-control bg-surface px-3 text-sm';
const STATUS_TONE: Record<OwnerOffer['status'], BadgeTone> = {
  ACTIVE: 'success',
  PAUSED: 'neutral',
  EXPIRED: 'neutral',
  REMOVED: 'danger',
};

interface Draft {
  placeId: string;
  title: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscount: string;
  minOrderAmount: string;
  validFrom: string;
  validUntil: string;
  days: number;
  limitPeriod: LimitPeriod;
  limitPerStudent: string;
  totalLimit: string;
  terms: string;
}

const numberOrNull = (text: string) => (text.trim() === '' ? null : Math.round(Number(text)));

function VerifyBox({ onUsed }: { onUsed: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<BusinessRedemption | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setResult(null);
    try {
      const response = await engagementService.verifyCode(code.trim().toUpperCase());
      setResult(response.data);
      setCode('');
      toast.show('Offer applied');
      onUsed();
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not check the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Icon name="check" className="size-5 text-accent-600" /> Check a student’s code
      </p>
      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={6}
          placeholder="6-character code"
          aria-label="Offer code"
          className={`${INPUT} flex-1 font-mono text-lg tracking-widest uppercase`}
        />
        <Button type="submit" loading={busy} disabled={code.trim().length !== 6}>
          Use code
        </Button>
      </form>
      {problem && (
        <p role="alert" className="text-sm text-danger-700">
          {problem}
        </p>
      )}
      {result && (
        <p className="rounded-md bg-success-50 px-3 py-2 text-sm text-success-700">
          {result.offer.headline} for {result.student.name}: {result.offer.title}. Give the discount
          now.
        </p>
      )}
    </Card>
  );
}

/** Student offers: create, pause or resume, and check the codes students show at the counter. */
export function OffersPanel({ listings }: { listings: BusinessListing[] }) {
  const toast = useToast();
  const [offers, setOffers] = useState<OwnerOffer[] | null>(null);
  const [redemptions, setRedemptions] = useState<BusinessRedemption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      engagementService.ownerOffers(controller.signal),
      engagementService.businessRedemptions(1, controller.signal),
    ])
      .then(([list, uses]) => {
        setOffers(list.data);
        setRedemptions(uses.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load offers.');
      });
    return () => controller.abort();
  }, [reload]);

  const blank = (): Draft => ({
    placeId: listings[0]?.id ?? '',
    title: '',
    description: '',
    discountType: 'PERCENT',
    discountValue: '10',
    maxDiscount: '',
    minOrderAmount: '',
    validFrom: indiaDate(),
    validUntil: '',
    days: EVERY_DAY,
    limitPeriod: 'ONCE',
    limitPerStudent: '1',
    totalLimit: '',
    terms: '',
  });

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setProblem(null);
    try {
      await engagementService.createOffer({
        placeId: draft.placeId,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        discountType: draft.discountType,
        discountValue:
          draft.discountType === 'FREEBIE' ? 0 : Math.round(Number(draft.discountValue)),
        maxDiscount: draft.discountType === 'PERCENT' ? numberOrNull(draft.maxDiscount) : null,
        minOrderAmount: numberOrNull(draft.minOrderAmount),
        validFrom: draft.validFrom,
        validUntil: draft.validUntil || null,
        daysOfWeek: draft.days,
        limitPeriod: draft.limitPeriod,
        limitPerStudent: Math.max(1, Math.round(Number(draft.limitPerStudent) || 1)),
        totalLimit: numberOrNull(draft.totalLimit),
        terms: draft.terms.trim() || null,
      });
      toast.show('Offer is live');
      setDraft(null);
      refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const fields = caught.details?.fields as Record<string, string[]> | undefined;
        setProblem(fields ? Object.values(fields).flat().join(' ') : caught.message);
      } else setProblem('Could not create the offer.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(offer: OwnerOffer) {
    try {
      await engagementService.updateOffer(offer.id, {
        status: offer.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      });
      toast.show(offer.status === 'ACTIVE' ? 'Offer paused' : 'Offer resumed');
      refresh();
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not update.', 'error');
    }
  }

  if (listings.length === 0)
    return (
      <EmptyState
        title="Add a listing first"
        description="Offers belong to one of your listings."
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <VerifyBox onUsed={refresh} />
        <Card className="flex flex-col justify-between gap-3 p-5">
          <div>
            <p className="font-semibold text-ink">Student offers</p>
            <p className="text-sm text-body">
              Students see live offers on your page, in “Offers” and when they scan your QR code.
              Students who saved you hear about new ones.
            </p>
          </div>
          <Button className="self-start" onClick={() => setDraft(blank())}>
            <Icon name="plus" className="size-4" /> New offer
          </Button>
        </Card>
      </div>

      {draft && (
        <Card className="p-5">
          <form onSubmit={(event) => void create(event)} className="grid gap-3 sm:grid-cols-2">
            <p className="font-semibold text-ink sm:col-span-2">New student offer</p>
            {listings.length > 1 && (
              <div className="sm:col-span-2">
                <PlacePicker
                  listings={listings}
                  value={draft.placeId}
                  onChange={(placeId) => setDraft({ ...draft, placeId })}
                />
              </div>
            )}
            <input
              required
              maxLength={80}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Title, e.g. 10% off for CampusPin students"
              aria-label="Title"
              className={`${INPUT} sm:col-span-2`}
            />
            <select
              value={draft.discountType}
              onChange={(event) =>
                setDraft({ ...draft, discountType: event.target.value as DiscountType })
              }
              aria-label="Discount type"
              className={INPUT}
            >
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Rupees off</option>
              <option value="FREEBIE">Free item or perk</option>
            </select>
            {draft.discountType !== 'FREEBIE' ? (
              <input
                type="number"
                min={1}
                value={draft.discountValue}
                onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })}
                aria-label={draft.discountType === 'PERCENT' ? 'Percent' : 'Rupees'}
                placeholder={draft.discountType === 'PERCENT' ? 'Percent' : 'Rupees'}
                className={INPUT}
              />
            ) : (
              <span className="self-center text-sm text-muted">Describe the perk in the title</span>
            )}
            {draft.discountType === 'PERCENT' && (
              <input
                type="number"
                min={1}
                value={draft.maxDiscount}
                onChange={(event) => setDraft({ ...draft, maxDiscount: event.target.value })}
                placeholder="Most off, in ₹ (optional)"
                aria-label="Maximum discount"
                className={INPUT}
              />
            )}
            <input
              type="number"
              min={1}
              value={draft.minOrderAmount}
              onChange={(event) => setDraft({ ...draft, minOrderAmount: event.target.value })}
              placeholder="Minimum order ₹ (optional)"
              aria-label="Minimum order"
              className={INPUT}
            />
            <label className="flex flex-col gap-1 text-sm text-ink">
              From
              <input
                type="date"
                required
                value={draft.validFrom}
                onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Until (optional)
              <input
                type="date"
                value={draft.validUntil}
                onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })}
                className={INPUT}
              />
            </label>
            <fieldset className="flex flex-wrap gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm text-ink">Days</legend>
              {WEEKDAYS.map((day, index) => {
                const on = (draft.days & (1 << index)) !== 0;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft({ ...draft, days: draft.days ^ (1 << index) })}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-accent-600 bg-accent-50 text-accent-700' : 'border-line text-muted'}`}
                  >
                    {day}
                  </button>
                );
              })}
            </fieldset>
            <div className="flex items-center gap-2 text-sm text-ink">
              <input
                type="number"
                min={1}
                max={50}
                value={draft.limitPerStudent}
                onChange={(event) => setDraft({ ...draft, limitPerStudent: event.target.value })}
                aria-label="Uses per student"
                className={`${INPUT} w-20`}
              />
              use(s) per student
              <select
                value={draft.limitPeriod}
                onChange={(event) =>
                  setDraft({ ...draft, limitPeriod: event.target.value as LimitPeriod })
                }
                aria-label="Per"
                className={INPUT}
              >
                <option value="ONCE">in total</option>
                <option value="DAILY">each day</option>
              </select>
            </div>
            <input
              type="number"
              min={1}
              value={draft.totalLimit}
              onChange={(event) => setDraft({ ...draft, totalLimit: event.target.value })}
              placeholder="Total uses for everyone (optional)"
              aria-label="Total uses"
              className={INPUT}
            />
            <textarea
              value={draft.terms}
              maxLength={1000}
              onChange={(event) => setDraft({ ...draft, terms: event.target.value })}
              placeholder="Terms (optional), e.g. Show your student ID"
              aria-label="Terms"
              className="min-h-20 rounded-md border border-control px-3 py-2 text-sm sm:col-span-2"
            />
            {problem && <p className="text-sm text-danger-700 sm:col-span-2">{problem}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="submit"
                loading={busy}
                disabled={!draft.title.trim() || draft.days === 0}
              >
                Publish offer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !offers ? (
        <Skeleton className="h-40 w-full" />
      ) : offers.length === 0 ? (
        <EmptyState
          title="No offers yet"
          description="A student offer brings students in on quiet days. It takes a minute."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {offers.map((offer) => (
            <li key={offer.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-extrabold text-accent-700">{offerHeadline(offer)}</span>
                  <Badge tone={STATUS_TONE[offer.status]}>{offer.status.toLowerCase()}</Badge>
                </div>
                <p className="font-semibold text-ink">{offer.title}</p>
                <p className="text-xs text-muted">
                  {offer.place.name} · {validityText(offer)} · used {offer.redeemedCount}
                  {offer.totalLimit ? ` of ${offer.totalLimit}` : ''} times
                </p>
                {offer.removedReason && (
                  <p className="text-sm text-danger-700">
                    Taken down by CampusPin: {offer.removedReason}
                  </p>
                )}
                {(offer.status === 'ACTIVE' || offer.status === 'PAUSED') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-auto self-start"
                    onClick={() => void toggle(offer)}
                  >
                    {offer.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {redemptions.length > 0 && (
        <Card className="p-5">
          <p className="mb-2 font-semibold text-ink">Recently used</p>
          <ul className="divide-y divide-line text-sm">
            {redemptions.slice(0, 10).map((use) => (
              <li key={use.id} className="flex justify-between gap-3 py-2">
                <span className="text-ink">
                  {use.offer.headline} · {use.student.name}
                  {use.orderId ? ' · on an order' : ''}
                </span>
                <span className="text-muted">
                  {use.redeemedAt ? new Date(use.redeemedAt).toLocaleString('en-IN') : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
