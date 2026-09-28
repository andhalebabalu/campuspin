'use client';

import { ApiClientError } from '@platform/api-client';
import {
  EVERY_DAY,
  WEEKDAYS,
  offerHeadline,
  type Redemption,
  type StudentOffer,
} from '@platform/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { distanceLabel } from '@/features/services/lib/service-meta';
import { useSession } from '@/lib/auth/session-context';
import { engagementService } from '@/services/engagement.service';

/** "Mon, Wed, Fri" or "Every day". */
export function daysText(mask: number): string {
  if (mask === EVERY_DAY) return 'Every day';
  return WEEKDAYS.filter((_, index) => (mask & (1 << index)) !== 0).join(', ');
}

export function validityText(offer: Pick<StudentOffer, 'validUntil' | 'daysOfWeek'>): string {
  const until = offer.validUntil
    ? `until ${new Date(`${offer.validUntil}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    : 'no end date';
  return `${daysText(offer.daysOfWeek)} · ${until}`;
}

function useCountdown(expiresAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return '';
  const left = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  return left === 0 ? 'Expired' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

/** The code a student shows at the counter, big and as a QR, with the time left. */
export function CodeDialog({
  redemption,
  onClose,
}: {
  redemption: Redemption;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const left = useCountdown(redemption.status === 'ISSUED' ? redemption.expiresAt : null);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(redemption.code, { width: 240, margin: 1 }).then((url) => {
      if (active) setQr(url);
    });
    return () => {
      active = false;
    };
  }, [redemption.code]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Offer code"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-surface p-6 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-semibold text-accent-700">{redemption.offer.headline}</p>
        <p className="font-semibold text-ink">{redemption.offer.title}</p>
        <p className="text-sm text-body">Show this at {redemption.place.name}</p>
        <p className="rounded-xl bg-subtle px-6 py-3 font-mono text-4xl font-bold tracking-[0.3em] text-ink">
          {redemption.code}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL. */}
        {qr && <img src={qr} alt={`QR of code ${redemption.code}`} className="size-40" />}
        {redemption.status === 'ISSUED' ? (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Icon name="clock" className="size-4" /> Valid for {left}
          </p>
        ) : (
          <p className="text-sm text-muted">
            {redemption.status === 'REDEEMED' ? 'Already used' : 'Expired'}
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** One student offer, with a button that gets a counter code. */
export function OfferCard({
  offer,
  showPlace = true,
}: {
  offer: StudentOffer;
  showPlace?: boolean;
}) {
  const { status } = useSession();
  const pathname = usePathname();
  const toast = useToast();
  const [code, setCode] = useState<Redemption | null>(null);
  const [busy, setBusy] = useState(false);
  const distance = distanceLabel(offer.distanceMeters);

  async function getCode() {
    setBusy(true);
    try {
      setCode((await engagementService.redeem(offer.id)).data);
    } catch (caught) {
      toast.show(
        caught instanceof ApiClientError ? caught.message : 'Could not get a code.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-accent-50 px-3 py-1.5 text-lg font-extrabold text-accent-700">
          {offerHeadline(offer)}
        </span>
        {distance && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Icon name="pin" className="size-3.5" /> {distance}
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-ink">{offer.title}</p>
        {showPlace && (
          <Link
            href={ROUTES.placeDetail(offer.place.slug)}
            className="text-sm text-primary-700 hover:underline"
          >
            {offer.place.name}
          </Link>
        )}
        {offer.description && <p className="mt-1 text-sm text-body">{offer.description}</p>}
      </div>
      <p className="text-xs text-muted">
        {validityText(offer)}
        {offer.minOrderAmount ? ` · min. order ₹${offer.minOrderAmount}` : ''}
        {offer.maxDiscount ? ` · up to ₹${offer.maxDiscount} off` : ''}
        {offer.limitPeriod === 'DAILY'
          ? ` · ${offer.limitPerStudent}× a day`
          : offer.limitPerStudent > 1
            ? ` · ${offer.limitPerStudent}× per student`
            : ' · once per student'}
      </p>
      {offer.terms && <p className="text-xs text-muted">Terms: {offer.terms}</p>}
      <div className="mt-auto">
        {status === 'authenticated' ? (
          <Button size="sm" loading={busy} onClick={() => void getCode()}>
            <Icon name="tag" className="size-4" /> Get code
          </Button>
        ) : (
          <Link
            href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
            className="inline-flex h-9 items-center rounded-md bg-action px-3 text-sm font-medium text-white"
          >
            Sign in to use
          </Link>
        )}
      </div>
      {code && <CodeDialog redemption={code} onClose={() => setCode(null)} />}
    </Card>
  );
}
