'use client';

import { CREDIT_REASON_LABELS, type AdminMemberCredits } from '@platform/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listingLimitsService } from '@/services/listing-limits.service';
import { dateFormat, errorMessage } from './admin-ui';

/** A student's listing credits: balance, give or take credits, and the recent history. */
export function ListingCreditsPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminMemberCredits | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listingLimitsService
      .credits(userId, controller.signal)
      .then((result) => setData(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setProblem(errorMessage(caught, 'Could not load credits.'));
      });
    return () => controller.abort();
  }, [userId]);

  async function submit(event: FormEvent, sign: 1 | -1) {
    event.preventDefault();
    const value = Math.abs(Math.trunc(Number(amount)));
    if (!value) {
      setProblem('Enter how many credits.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await listingLimitsService.adjust(userId, {
        amount: sign * value,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setData(result.data);
      setAmount('');
      setNote('');
    } catch (caught) {
      setProblem(errorMessage(caught, 'Could not change the credits.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm text-body">Listing credits</span>
        <span className="text-2xl font-bold text-ink">
          {data ? Math.max(0, data.credits) : '…'}
        </span>
        {data && (
          <span className="text-xs text-muted">
            ({data.startingCredits} starting for everyone, plus the changes below)
          </span>
        )}
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void submit(event, 1)}>
        <div className="w-28">
          <Input
            label="Credits"
            type="number"
            min={1}
            max={1000}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="min-w-48 flex-1">
          <Input
            label="Note (optional)"
            placeholder="e.g. Paid ₹50 by UPI"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" className="h-10" loading={busy}>
          Give
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-10"
          disabled={busy}
          onClick={(event) => void submit(event, -1)}
        >
          Take away
        </Button>
      </form>
      {problem && <p className="text-sm text-danger-700">{problem}</p>}
      {data && data.history.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {data.history.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-2 text-body">
              <span
                className={
                  entry.amount > 0
                    ? 'font-semibold text-success-700'
                    : 'font-semibold text-danger-700'
                }
              >
                {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
              </span>
              <span>{CREDIT_REASON_LABELS[entry.reason]}</span>
              {entry.listing && <span>· {entry.listing.title}</span>}
              {entry.note && <span>· {entry.note}</span>}
              <span className="text-muted">
                · {dateFormat.format(new Date(entry.createdAt))}
                {entry.actorName ? ` by ${entry.actorName}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
