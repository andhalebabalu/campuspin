'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PROMOTION_AUDIENCES,
  PROMOTION_AUDIENCE_LABELS,
  PROMOTION_BODY_MAX,
  PROMOTION_DISPLAY_SECONDS_DEFAULT,
  PROMOTION_DISPLAY_SECONDS_MAX,
  PROMOTION_DISPLAY_SECONDS_MIN,
  PROMOTION_KINDS,
  PROMOTION_KIND_LABELS,
  PROMOTION_PLACEMENT_LABELS,
  PROMOTION_SKIP_AFTER_DEFAULT,
  createPromotionSchema,
  type AdminPromotion,
  type PromotionAudience,
  type PromotionKind,
  type PromotionPlacement,
} from '@platform/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ImageUploader } from '@/components/shared/image-uploader';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { promotionsAdminService } from '@/services/promotions.service';
import { AdminHeader, SELECT_CLASSES, dateFormat, errorMessage, useAdminList } from './admin-ui';

const STATE: Record<AdminPromotion['state'], { label: string; tone: BadgeTone }> = {
  LIVE: { label: 'Live', tone: 'success' },
  SCHEDULED: { label: 'Scheduled', tone: 'accent' },
  ENDED: { label: 'Ended', tone: 'neutral' },
  PAUSED: { label: 'Paused', tone: 'neutral' },
};

/** `2026-10-01T09:30` (what a datetime-local input shows) from an ISO time, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/**
 * In-app ads and announcements. A full-screen ad shows when the student or business app opens; a
 * Featured card sits on the student home and the business dashboard. Use them to announce a new
 * CampusPin feature or to boost a business.
 */
export function PromotionsScreen() {
  const list = useAdminList((signal) => promotionsAdminService.list(signal), []);
  const [editing, setEditing] = useState<AdminPromotion | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle(promotion: AdminPromotion) {
    try {
      const next = (await promotionsAdminService.update(promotion.id, { active: !promotion.active })).data;
      list.replace((item) => item.id === next.id, next);
      setNotice(null);
    } catch (caught) {
      setNotice(errorMessage(caught, 'Could not change it.'));
    }
  }

  async function remove(promotion: AdminPromotion) {
    if (!window.confirm(`Delete “${promotion.title}”? Its reach stays in the audit log.`)) return;
    try {
      await promotionsAdminService.remove(promotion.id);
      list.reload();
    } catch (caught) {
      setNotice(errorMessage(caught, 'Could not delete it.'));
    }
  }

  return (
    <div>
      <AdminHeader
        title="Ads & announcements"
        description="Show a full-screen ad when the app opens, or a card in the Featured section of the student home and business dashboard."
        action={<Button onClick={() => setEditing('new')}>New ad</Button>}
      />
      {notice && (
        <div className="mb-4">
          <FormAlert message={notice} />
        </div>
      )}

      {list.error ? (
        <ErrorState message={list.error.message} requestId={list.error.requestId} onRetry={list.reload} />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState
          title="No ads yet"
          description="Create one to announce a feature or boost a business."
          action={<Button onClick={() => setEditing('new')}>New ad</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((promotion) => {
            const state = STATE[promotion.state];
            const rate = promotion.views > 0 ? Math.round((promotion.clicks / promotion.views) * 100) : 0;
            return (
              <li key={promotion.id}>
                <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary-800 to-primary-600">
                    {promotion.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded, served by the API.
                      <img src={promotion.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="px-2 text-center text-xs font-semibold text-white">
                        {PROMOTION_KIND_LABELS[promotion.kind]}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{promotion.title}</span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                      <Badge tone="neutral">{promotion.placement === 'SPLASH' ? 'Full screen' : 'Featured card'}</Badge>
                    </div>
                    <span className="text-sm text-body">
                      {PROMOTION_AUDIENCE_LABELS[promotion.audience]} · {PROMOTION_KIND_LABELS[promotion.kind]}
                      {promotion.placement === 'SPLASH' &&
                        ` · ${promotion.displaySeconds} s, close after ${promotion.skipAfterSeconds} s`}
                      {` · priority ${promotion.priority}`}
                    </span>
                    <span className="text-xs text-muted">
                      {promotion.startsAt ? `From ${dateFormat.format(new Date(promotion.startsAt))}` : 'No start date'}
                      {' · '}
                      {promotion.endsAt ? `until ${dateFormat.format(new Date(promotion.endsAt))}` : 'no end date'}
                      {` · ${promotion.views} views · ${promotion.clicks} taps (${rate}%)`}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void toggle(promotion)}>
                      {promotion.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(promotion)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(promotion)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <PromotionDialog
        promotion={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.reload();
        }}
      />
    </div>
  );
}

interface FormValues {
  placement: PromotionPlacement;
  kind: PromotionKind;
  audience: PromotionAudience;
  title: string;
  body: string;
  images: string[];
  ctaLabel: string;
  ctaLink: string;
  displaySeconds: string;
  skipAfterSeconds: string;
  priority: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

function initialValues(promotion: AdminPromotion | null): FormValues {
  return {
    placement: promotion?.placement ?? 'SPLASH',
    kind: promotion?.kind ?? 'ANNOUNCEMENT',
    audience: promotion?.audience ?? 'ALL',
    title: promotion?.title ?? '',
    body: promotion?.body ?? '',
    images: promotion?.imageUrl ? [promotion.imageUrl] : [],
    ctaLabel: promotion?.ctaLabel ?? '',
    ctaLink: promotion?.ctaLink ?? '',
    displaySeconds: String(promotion?.displaySeconds ?? PROMOTION_DISPLAY_SECONDS_DEFAULT),
    skipAfterSeconds: String(promotion?.skipAfterSeconds ?? PROMOTION_SKIP_AFTER_DEFAULT),
    priority: String(promotion?.priority ?? 0),
    startsAt: toLocalInput(promotion?.startsAt ?? null),
    endsAt: toLocalInput(promotion?.endsAt ?? null),
    active: promotion?.active ?? true,
  };
}

function PromotionDialog({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: AdminPromotion | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const existing = promotion && promotion !== 'new' ? promotion : null;
  const [values, setValues] = useState<FormValues>(() => initialValues(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (promotion && !dialog.open) {
      setValues(initialValues(existing));
      setErrors({});
      setFormError(null);
      dialog.showModal();
    }
    if (!promotion && dialog.open) dialog.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a new ad is opened.
  }, [promotion]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const dto = {
      placement: values.placement,
      kind: values.kind,
      audience: values.audience,
      title: values.title,
      body: values.body.trim() || null,
      imageUrl: values.images[0] ?? null,
      ctaLabel: values.ctaLabel.trim() || null,
      ctaLink: values.ctaLink.trim() || null,
      displaySeconds: Number(values.displaySeconds),
      skipAfterSeconds: Number(values.skipAfterSeconds),
      priority: Number(values.priority) || 0,
      startsAt: fromLocalInput(values.startsAt),
      endsAt: fromLocalInput(values.endsAt),
      active: values.active,
    };
    const parsed = createPromotionSchema.safeParse(dto);
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (existing) await promotionsAdminService.update(existing.id, parsed.data);
      else await promotionsAdminService.create(parsed.data);
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors) setErrors(firstFieldErrors(caught.fieldErrors));
      else setFormError(errorMessage(caught, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  const splash = values.placement === 'SPLASH';

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(64rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      {promotion && (
        <form onSubmit={(event) => void submit(event)} className="grid gap-6 p-6 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{existing ? 'Edit ad' : 'New ad'}</h2>
            {formError && <FormAlert message={formError} />}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Where it shows</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['SPLASH', 'FEED'] as const).map((placement) => (
                  <label
                    key={placement}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-sm ${
                      values.placement === placement ? 'border-action bg-primary-50' : 'border-line'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input
                        type="radio"
                        name="placement"
                        checked={values.placement === placement}
                        onChange={() => set('placement', placement)}
                      />
                      {placement === 'SPLASH' ? 'Full-screen ad' : 'Featured card'}
                    </span>
                    <span className="text-muted">{PROMOTION_PLACEMENT_LABELS[placement]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Type
                <select className={SELECT_CLASSES} value={values.kind} onChange={(e) => set('kind', e.target.value as PromotionKind)}>
                  {PROMOTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {PROMOTION_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Who sees it
                <select
                  className={SELECT_CLASSES}
                  value={values.audience}
                  onChange={(e) => set('audience', e.target.value as PromotionAudience)}
                >
                  {PROMOTION_AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {PROMOTION_AUDIENCE_LABELS[audience]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Input label="Title" value={values.title} maxLength={80} onChange={(e) => set('title', e.target.value)} error={errors.title} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Text (optional)
              <textarea
                rows={3}
                maxLength={PROMOTION_BODY_MAX}
                value={values.body}
                onChange={(e) => set('body', e.target.value)}
                className="rounded-md border border-control bg-surface px-3 py-2 text-sm font-normal"
              />
              {errors.body && <span className="text-sm text-danger-700">{errors.body}</span>}
            </label>
            <ImageUploader
              label="Image (optional)"
              hint="Portrait works best for full-screen ads, landscape for cards."
              value={values.images}
              onChange={(urls) => set('images', urls)}
              max={1}
              onBusyChange={setUploading}
              error={errors.imageUrl}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Button text (optional)"
                placeholder="e.g. Open the marketplace"
                value={values.ctaLabel}
                maxLength={30}
                onChange={(e) => set('ctaLabel', e.target.value)}
                error={errors.ctaLabel}
              />
              <Input
                label="Button link"
                placeholder="/places/sai-mess or https://…"
                value={values.ctaLink}
                onChange={(e) => set('ctaLink', e.target.value)}
                error={errors.ctaLink}
                hint="App paths: /marketplace, /marketplace/new, /community, /places/<slug>, /dashboard"
              />
            </div>

            {splash && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Seconds on screen"
                  type="number"
                  min={PROMOTION_DISPLAY_SECONDS_MIN}
                  max={PROMOTION_DISPLAY_SECONDS_MAX}
                  value={values.displaySeconds}
                  onChange={(e) => set('displaySeconds', e.target.value)}
                  error={errors.displaySeconds}
                  hint="The ad closes by itself after this."
                />
                <Input
                  label="Close button after (seconds)"
                  type="number"
                  min={0}
                  max={PROMOTION_DISPLAY_SECONDS_MAX}
                  value={values.skipAfterSeconds}
                  onChange={(e) => set('skipAfterSeconds', e.target.value)}
                  error={errors.skipAfterSeconds}
                  hint="0 shows it right away."
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Starts (optional)" type="datetime-local" value={values.startsAt} onChange={(e) => set('startsAt', e.target.value)} error={errors.startsAt} />
              <Input label="Ends (optional)" type="datetime-local" value={values.endsAt} onChange={(e) => set('endsAt', e.target.value)} error={errors.endsAt} />
              <Input
                label="Priority"
                type="number"
                min={0}
                max={1000}
                value={values.priority}
                onChange={(e) => set('priority', e.target.value)}
                hint="Higher shows first."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.active} onChange={(e) => set('active', e.target.checked)} />
              Live (untick to save it paused)
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={uploading}>
                {existing ? 'Save' : 'Create ad'}
              </Button>
            </div>
          </div>

          <Preview values={values} />
        </form>
      )}
    </dialog>
  );
}

/** Roughly what members will see in the app. */
function Preview({ values }: { values: FormValues }) {
  const image = values.images[0];
  const kind = PROMOTION_KIND_LABELS[values.kind];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Preview</span>
      {values.placement === 'SPLASH' ? (
        <div className="relative flex aspect-[9/16] flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 p-4 text-white shadow-lg">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded, served by the API.
            <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="relative flex items-center justify-between text-xs">
            <span className="rounded-full bg-white/20 px-2 py-1">{kind}</span>
            <span className="rounded-full bg-black/40 px-2 py-1">
              Close in {values.skipAfterSeconds || 0}s
            </span>
          </div>
          <div className="relative mt-auto flex flex-col gap-2 rounded-xl bg-black/35 p-3">
            <span className="text-lg font-bold leading-tight">{values.title || 'Your title'}</span>
            {values.body && <span className="text-sm text-white/85">{values.body}</span>}
            {values.ctaLabel && (
              <span className="mt-1 rounded-lg bg-white py-2 text-center text-sm font-semibold text-primary-800">
                {values.ctaLabel}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <div className="relative flex h-28 items-end bg-gradient-to-br from-primary-800 to-primary-600 p-3">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded, served by the API.
              <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
            ) : null}
            <span className="relative rounded-full bg-white/20 px-2 py-1 text-xs text-white">{kind}</span>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <span className="font-semibold">{values.title || 'Your title'}</span>
            {values.body && <span className="text-sm text-body">{values.body}</span>}
            {values.ctaLabel && <span className="text-sm font-semibold text-action">{values.ctaLabel} →</span>}
          </div>
        </div>
      )}
    </div>
  );
}
