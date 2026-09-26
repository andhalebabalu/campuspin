'use client';

import { ApiClientError } from '@platform/api-client';
import {
  COLLEGE_RADIUS,
  createCollegeRequestSchema,
  updateCollegeRequestSchema,
  type AdminCollege,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { ImageUploader } from '@/components/shared/image-uploader';
import { MapPicker } from '@/components/shared/map-picker';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { adminService } from '@/services/admin.service';
import { ReasonDialog, errorMessage, type ReasonRequest } from './admin-ui';
import { CollegeEmailDomains } from './college-email-domains';
import { COLLEGE_STATUS } from './colleges-screen';

interface Values {
  name: string;
  shortName: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: string;
  website: string;
  logoUrl: string;
  coverImageUrl: string;
  publish: boolean;
}

const EMPTY: Values = {
  name: '',
  shortName: '',
  description: '',
  address: '',
  city: '',
  state: 'Maharashtra',
  country: 'India',
  latitude: null,
  longitude: null,
  radiusKm: String(COLLEGE_RADIUS.default / 1000),
  website: '',
  logoUrl: '',
  coverImageUrl: '',
  publish: false,
};

function valuesOf(college: AdminCollege): Values {
  return {
    name: college.name,
    shortName: college.shortName ?? '',
    description: college.description ?? '',
    address: college.address,
    city: college.city,
    state: college.state,
    country: college.country,
    latitude: college.latitude,
    longitude: college.longitude,
    radiusKm: String(college.serviceRadiusMeters / 1000),
    website: college.website ?? '',
    logoUrl: college.logoUrl ?? '',
    coverImageUrl: college.coverImageUrl ?? '',
    publish: college.status === 'ACTIVE',
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value);
const orUndefined = (value: string) => (value.trim() === '' ? undefined : value);

/** Create (`collegeId` absent) or edit a college, its campus pin, radius, logo, cover and gallery. */
export function CollegeEditor({ collegeId }: { collegeId?: string }) {
  const router = useRouter();
  const [college, setCollege] = useState<AdminCollege | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);

  useEffect(() => {
    if (!collegeId) return;
    const controller = new AbortController();
    adminService
      .college(collegeId, controller.signal)
      .then((result) => {
        setCollege(result.data);
        setValues(valuesOf(result.data));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(caught, 'Could not load.'));
      });
    return () => controller.abort();
  }, [collegeId]);

  if (loadError) return <ErrorState message={loadError} />;
  if (collegeId && !college) return <Skeleton className="h-[40rem] w-full" />;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const common = {
      name: values.name,
      address: values.address,
      city: values.city,
      state: values.state,
      country: values.country,
      latitude: values.latitude ?? undefined,
      longitude: values.longitude ?? undefined,
      serviceRadiusMeters: Math.round(Number(values.radiusKm) * 1000),
    };
    const parsed = college
      ? updateCollegeRequestSchema.safeParse({
          ...common,
          shortName: orNull(values.shortName),
          description: orNull(values.description),
          website: orNull(values.website),
          logoUrl: orNull(values.logoUrl),
          coverImageUrl: orNull(values.coverImageUrl),
        })
      : createCollegeRequestSchema.safeParse({
          ...common,
          shortName: orUndefined(values.shortName),
          description: orUndefined(values.description),
          website: orUndefined(values.website),
          logoUrl: orUndefined(values.logoUrl),
          coverImageUrl: orUndefined(values.coverImageUrl),
          status: values.publish ? 'ACTIVE' : 'DRAFT',
        });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      let result = college
        ? await adminService.updateCollege(college.id, parsed.data)
        : await adminService.createCollege(
            parsed.data as Parameters<typeof adminService.createCollege>[0],
          );
      for (const imageUrl of gallery) {
        result = await adminService.addCollegeImage(result.data.id, { imageUrl });
      }
      setGallery([]);
      if (!college) {
        router.replace(ROUTES.adminCollege(result.data.id));
        return;
      }
      setCollege(result.data);
      setValues(valuesOf(result.data));
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors) {
        setErrors(firstFieldErrors(caught.fieldErrors));
        setFormError({ message: 'Please fix the highlighted fields.' });
      } else {
        setFormError({
          message: errorMessage(caught, 'Could not save.'),
          requestId: caught instanceof ApiClientError ? caught.requestId : undefined,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  function action(kind: 'activate' | 'deactivate' | 'verify' | 'unverify', title: string) {
    if (!college) return;
    setDialog({
      title,
      confirmLabel: title.replace(/\?$/, ''),
      required: false,
      danger: kind === 'deactivate' || kind === 'unverify',
      onConfirm: async (reason) => {
        setCollege((await adminService.collegeAction(college.id, kind, reason)).data);
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href={ROUTES.adminColleges}
            className="text-sm font-medium text-action hover:underline"
          >
            ← All colleges
          </Link>
          <h1 className="text-2xl font-bold text-ink">{college ? college.name : 'New college'}</h1>
          {college && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={COLLEGE_STATUS[college.status].tone}>
                {COLLEGE_STATUS[college.status].label}
              </Badge>
              <Badge tone={college.verified ? 'success' : 'neutral'}>
                {college.verified ? 'Verified' : 'Not verified'}
              </Badge>
              {college.status === 'ACTIVE' && (
                <Link
                  href={ROUTES.collegeDetail(college.slug)}
                  target="_blank"
                  className="text-sm text-action hover:underline"
                >
                  View public page ↗
                </Link>
              )}
            </div>
          )}
        </div>
        {college && (
          <div className="flex flex-wrap gap-2">
            {college.status === 'ACTIVE' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => action('deactivate', 'Unpublish this college?')}
              >
                Unpublish
              </Button>
            ) : (
              <Button size="sm" onClick={() => action('activate', 'Publish this college?')}>
                Publish
              </Button>
            )}
            {college.verified ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => action('unverify', 'Remove verification?')}
              >
                Unverify
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => action('verify', 'Mark as verified?')}
              >
                Verify
              </Button>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-6"
      >
        {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}

        <Card className="flex flex-col gap-5 p-6">
          <h2 className="font-semibold text-ink">Details</h2>
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <Input
              label="Name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
            />
            <Input
              label="Short name"
              value={values.shortName}
              onChange={(e) => set('shortName', e.target.value)}
              error={errors.shortName}
              placeholder="e.g. AMC"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="college-description" className="text-sm font-medium text-ink">
              Description
            </label>
            <textarea
              id="college-description"
              rows={4}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className="rounded-md border border-control bg-surface px-3.5 py-2.5 text-base text-ink"
            />
          </div>
          <Input
            label="Website"
            value={values.website}
            onChange={(e) => set('website', e.target.value)}
            error={errors.website}
            placeholder="https://"
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <ImageUploader
              label="Logo"
              max={1}
              value={values.logoUrl ? [values.logoUrl] : []}
              onChange={(urls) => set('logoUrl', urls[0] ?? '')}
              onBusyChange={setUploading}
              error={errors.logoUrl}
            />
            <ImageUploader
              label="Cover image"
              max={1}
              value={values.coverImageUrl ? [values.coverImageUrl] : []}
              onChange={(urls) => set('coverImageUrl', urls[0] ?? '')}
              onBusyChange={setUploading}
              error={errors.coverImageUrl}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5 p-6">
          <h2 className="font-semibold text-ink">Campus location</h2>
          <MapPicker
            value={
              values.latitude !== null && values.longitude !== null
                ? { latitude: values.latitude, longitude: values.longitude }
                : null
            }
            onChange={(point) => {
              setValues((current) => ({
                ...current,
                latitude: point.latitude,
                longitude: point.longitude,
              }));
              setSaved(false);
            }}
            onAddressFound={(found) =>
              setValues((current) => ({
                ...current,
                address: current.address || found.street,
                city: current.city || found.city,
              }))
            }
            error={errors.latitude ?? errors.longitude}
          />
          <Input
            label="Address"
            value={values.address}
            onChange={(e) => set('address', e.target.value)}
            error={errors.address}
          />
          <div className="grid gap-5 sm:grid-cols-4">
            <Input
              label="City"
              value={values.city}
              onChange={(e) => set('city', e.target.value)}
              error={errors.city}
            />
            <Input
              label="State"
              value={values.state}
              onChange={(e) => set('state', e.target.value)}
              error={errors.state}
            />
            <Input
              label="Country"
              value={values.country}
              onChange={(e) => set('country', e.target.value)}
              error={errors.country}
            />
            <Input
              label="Service radius (km)"
              type="number"
              step="0.1"
              min={COLLEGE_RADIUS.min / 1000}
              max={COLLEGE_RADIUS.max / 1000}
              value={values.radiusKm}
              onChange={(e) => set('radiusKm', e.target.value)}
              error={errors.serviceRadiusMeters}
            />
          </div>
          <p className="text-sm text-muted">
            Places within the radius show up on this college&apos;s page, nearest first.
          </p>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h2 className="font-semibold text-ink">Gallery</h2>
          {college && college.images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {college.images.map((image) => (
                <div key={image.id} className="flex w-32 flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote or uploaded image. */}
                  <img src={image.imageUrl} alt="" className="h-24 w-32 rounded-md object-cover" />
                  <button
                    type="button"
                    className="w-fit text-xs text-danger-700 hover:underline"
                    onClick={() =>
                      void adminService
                        .removeCollegeImage(college.id, image.id)
                        .then((result) => setCollege(result.data))
                        .catch((caught: unknown) =>
                          setFormError({
                            message: errorMessage(caught, 'Could not remove the photo.'),
                          }),
                        )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <ImageUploader
            label={college ? 'Add photos (saved with the form)' : 'Photos'}
            value={gallery}
            onChange={setGallery}
            max={10}
            onBusyChange={setUploading}
          />
        </Card>

        {!college && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={values.publish}
              onChange={(e) => set('publish', e.target.checked)}
            />
            Publish straight away (otherwise it is saved as a draft)
          </label>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={uploading}>
            {college ? 'Save changes' : 'Create college'}
          </Button>
          {saved && <span className="text-sm text-success-700">Saved.</span>}
        </div>
      </form>
      {college && <CollegeEmailDomains collegeId={college.id} />}
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
