'use client';

import {
  LISTING_LIMIT_MODES,
  LISTING_LIMIT_MODE_LABELS,
  type ListingLimitMode,
  type ListingLimitSettings,
} from '@platform/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { listingLimitsService } from '@/services/listing-limits.service';
import { AdminHeader, errorMessage } from './admin-ui';

interface FormValues {
  enabled: boolean;
  mode: ListingLimitMode;
  freeListings: string;
  startingCredits: string;
  creditsPerListing: string;
}

const toForm = (settings: ListingLimitSettings): FormValues => ({
  enabled: settings.enabled,
  mode: settings.mode,
  freeListings: String(settings.freeListings),
  startingCredits: String(settings.startingCredits),
  creditsPerListing: String(settings.creditsPerListing),
});

/**
 * Super admin: how many marketplace listings students get for free, and what extra listings cost
 * in credits. Off by default, so every listing is free until this is switched on.
 */
export function ListingLimitsScreen() {
  const [values, setValues] = useState<FormValues | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listingLimitsService
      .settings(controller.signal)
      .then((result) => {
        setValues(toForm(result.data));
        setLoadError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(errorMessage(caught, 'Could not load the settings.'));
      });
    return () => controller.abort();
  }, [reload]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => setReload((n) => n + 1)} />;
  if (!values) return <Skeleton className="h-96 w-full" />;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => (current ? { ...current, [key]: value } : current));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!values) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await listingLimitsService.updateSettings({
        enabled: values.enabled,
        mode: values.mode,
        freeListings: Number(values.freeListings),
        startingCredits: Number(values.startingCredits),
        creditsPerListing: Number(values.creditsPerListing),
      });
      setValues(toForm(result.data));
      setNotice({ tone: 'success', text: 'Saved. Students see the new limits right away.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught, 'Could not save.') });
    } finally {
      setBusy(false);
    }
  }

  const free = Number(values.freeListings) || 0;
  const cost = Number(values.creditsPerListing) || 1;
  const starting = Number(values.startingCredits) || 0;
  const summary = !values.enabled
    ? 'Limits are off: every student can list as much as they like, for free.'
    : `Each student gets ${free} free ${free === 1 ? 'listing' : 'listings'} ${
        values.mode === 'MONTHLY' ? 'every month' : 'live at a time'
      }. After that, a listing costs ${cost} ${cost === 1 ? 'credit' : 'credits'}. Every student starts with ${starting} ${
        starting === 1 ? 'credit' : 'credits'
      } (${Math.floor(starting / cost)} extra ${Math.floor(starting / cost) === 1 ? 'listing' : 'listings'}).`;

  return (
    <div>
      <AdminHeader
        title="Listing limits"
        description="Free marketplace listings for students, and credits for extra ones. Give or take a student's credits from Users → Credits."
      />
      <form onSubmit={(event) => void save(event)} className="flex max-w-2xl flex-col gap-5">
        {notice?.tone === 'error' && <FormAlert message={notice.text} />}
        {notice?.tone === 'success' && (
          <p role="status" className="rounded-md bg-success-50 px-4 py-3 text-sm text-success-700">
            {notice.text}
          </p>
        )}

        <Card className="flex flex-col gap-4 p-5">
          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-semibold text-ink">Limit student listings</span>
              <span className="text-sm text-body">Off: every listing is free.</span>
            </span>
            <input
              type="checkbox"
              className="size-5"
              checked={values.enabled}
              onChange={(event) => set('enabled', event.target.checked)}
            />
          </label>
        </Card>

        <Card className={`flex flex-col gap-4 p-5 ${values.enabled ? '' : 'opacity-60'}`}>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">How free listings are counted</legend>
            {LISTING_LIMIT_MODES.map((mode) => (
              <label key={mode} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  className="mt-0.5"
                  checked={values.mode === mode}
                  onChange={() => set('mode', mode)}
                />
                <span>
                  <span className="font-medium text-ink">{LISTING_LIMIT_MODE_LABELS[mode]}</span>
                  <span className="block text-muted">
                    {mode === 'ACTIVE'
                      ? 'Selling, deleting or letting a free listing expire frees its slot.'
                      : 'Counts new free listings in the calendar month (India time), then resets.'}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Free listings"
              type="number"
              min={0}
              max={100}
              value={values.freeListings}
              onChange={(event) => set('freeListings', event.target.value)}
            />
            <Input
              label="Credits per extra listing"
              type="number"
              min={1}
              max={100}
              value={values.creditsPerListing}
              onChange={(event) => set('creditsPerListing', event.target.value)}
            />
            <Input
              label="Starting credits"
              type="number"
              min={0}
              max={1000}
              value={values.startingCredits}
              onChange={(event) => set('startingCredits', event.target.value)}
              hint="For every student, current and new."
            />
          </div>
        </Card>

        <p className="rounded-md bg-subtle px-4 py-3 text-sm text-body">{summary}</p>
        <div>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
