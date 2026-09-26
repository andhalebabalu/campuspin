'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PRICE_UNITS,
  createPlaceRequestSchema,
  updatePlaceRequestSchema,
  type AdminAmenity,
  type AdminCategoryGroup,
  type AdminPlace,
  type PriceUnit,
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
import { UNIT_LABELS } from '@/utils/format-price';
import { ReasonDialog, SELECT_CLASSES, errorMessage, type ReasonRequest } from './admin-ui';
import { PLACE_STATUS } from './places-screen';

interface PriceRow {
  label: string;
  amount: string;
  unit: PriceUnit;
}

interface Values {
  name: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  email: string;
  website: string;
  categoryIds: string[];
  amenityIds: string[];
  priceOptions: PriceRow[];
  publish: boolean;
}

const EMPTY: Values = {
  name: '',
  description: '',
  address: '',
  city: '',
  state: 'Maharashtra',
  country: 'India',
  latitude: null,
  longitude: null,
  phone: '',
  email: '',
  website: '',
  categoryIds: [],
  amenityIds: [],
  priceOptions: [],
  publish: false,
};

function valuesOf(place: AdminPlace): Values {
  return {
    name: place.name,
    description: place.description ?? '',
    address: place.address,
    city: place.city,
    state: place.state,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude,
    phone: place.phone ?? '',
    email: place.email ?? '',
    website: place.website ?? '',
    // Primary first: the API makes the first id the primary category.
    categoryIds: [...place.categories]
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((category) => category.id),
    amenityIds: place.amenities.map((amenity) => amenity.id),
    priceOptions: place.priceOptions.map((option) => ({
      label: option.label,
      amount: String(option.amount),
      unit: option.unit,
    })),
    publish: place.status === 'ACTIVE',
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value);
const orUndefined = (value: string) => (value.trim() === '' ? undefined : value);

/**
 * Create (`placeId` absent) or edit a place: details, exact map location, categories, amenities,
 * prices and photos, plus the status actions. Opening hours keep whatever they were (not edited here).
 */
export function PlaceEditor({ placeId }: { placeId?: string }) {
  const router = useRouter();
  const [place, setPlace] = useState<AdminPlace | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [categories, setCategories] = useState<AdminCategoryGroup[] | null>(null);
  const [amenities, setAmenities] = useState<AdminAmenity[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newImages, setNewImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      adminService.categories(controller.signal),
      adminService.amenities(controller.signal),
      placeId ? adminService.place(placeId, controller.signal) : Promise.resolve(null),
    ])
      .then(([groups, amenityList, loaded]) => {
        setCategories(groups.data);
        setAmenities(amenityList.data);
        if (loaded) {
          setPlace(loaded.data);
          setValues(valuesOf(loaded.data));
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(caught, 'Could not load.'));
      });
    return () => controller.abort();
  }, [placeId]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!categories || !amenities || (placeId && !place))
    return <Skeleton className="h-[40rem] w-full" />;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function toggle(key: 'categoryIds' | 'amenityIds', itemId: string, on: boolean) {
    set(key, on ? [...values[key], itemId] : values[key].filter((other) => other !== itemId));
  }

  const common = {
    name: values.name,
    address: values.address,
    city: values.city,
    state: values.state,
    country: values.country,
    latitude: values.latitude ?? undefined,
    longitude: values.longitude ?? undefined,
    categoryIds: values.categoryIds,
    amenityIds: values.amenityIds,
    priceOptions: values.priceOptions.map((row) => ({
      label: row.label,
      amount: Number(row.amount),
      unit: row.unit,
    })),
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    const parsed = place
      ? updatePlaceRequestSchema.safeParse({
          ...common,
          description: orNull(values.description),
          phone: orNull(values.phone),
          email: orNull(values.email),
          website: orNull(values.website),
        })
      : createPlaceRequestSchema.safeParse({
          ...common,
          description: orUndefined(values.description),
          phone: orUndefined(values.phone),
          email: orUndefined(values.email),
          website: orUndefined(values.website),
          status: values.publish ? 'ACTIVE' : 'DRAFT',
        });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      let result = place
        ? await adminService.updatePlace(place.id, parsed.data)
        : await adminService.createPlace(
            parsed.data as Parameters<typeof adminService.createPlace>[0],
          );
      for (const [index, imageUrl] of newImages.entries()) {
        result = await adminService.addPlaceImage(result.data.id, {
          imageUrl,
          ...(result.data.images.length === 0 && index === 0 ? { isCover: true } : {}),
        });
      }
      setNewImages([]);
      if (!place) {
        router.replace(ROUTES.adminPlace(result.data.id));
        return;
      }
      setPlace(result.data);
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
    if (!place) return;
    setDialog({
      title,
      confirmLabel: title.replace(/\?$/, ''),
      required: false,
      danger: kind === 'deactivate' || kind === 'unverify',
      onConfirm: async (reason) => {
        const result = await adminService.placeAction(place.id, kind, reason);
        setPlace(result.data);
      },
    });
  }

  async function imageAction(work: () => ReturnType<typeof adminService.setPlaceCover>) {
    try {
      setPlace((await work()).data);
    } catch (caught) {
      setFormError({ message: errorMessage(caught, 'Could not update the photo.') });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href={ROUTES.adminPlaces}
            className="text-sm font-medium text-action hover:underline"
          >
            ← All places
          </Link>
          <h1 className="text-2xl font-bold text-ink">{place ? place.name : 'New place'}</h1>
          {place && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={PLACE_STATUS[place.status].tone}>
                {PLACE_STATUS[place.status].label}
              </Badge>
              <Badge tone={place.verified ? 'success' : 'neutral'}>
                {place.verified ? 'Verified' : 'Not verified'}
              </Badge>
              {place.status === 'ACTIVE' && (
                <Link
                  href={ROUTES.placeDetail(place.slug)}
                  target="_blank"
                  className="text-sm text-action hover:underline"
                >
                  View public page ↗
                </Link>
              )}
            </div>
          )}
        </div>
        {place && (
          <div className="flex flex-wrap gap-2">
            {place.status !== 'ACTIVE' && place.status !== 'PENDING' && (
              <Button size="sm" onClick={() => action('activate', 'Publish this place?')}>
                Publish
              </Button>
            )}
            {place.status === 'ACTIVE' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => action('deactivate', 'Unpublish this place?')}
              >
                Unpublish
              </Button>
            )}
            {place.verified ? (
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

      {place?.status === 'PENDING' && (
        <p className="rounded-md bg-accent-50 px-4 py-3 text-sm text-accent-700">
          This place is waiting for review. Approve or reject it from{' '}
          <Link href={ROUTES.adminSubmissions} className="font-medium underline">
            Submissions
          </Link>
          .
        </p>
      )}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-6"
      >
        {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}

        <Card className="flex flex-col gap-5 p-6">
          <h2 className="font-semibold text-ink">Details</h2>
          <Input
            label="Name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="place-description" className="text-sm font-medium text-ink">
              Description
            </label>
            <textarea
              id="place-description"
              rows={4}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className="rounded-md border border-control bg-surface px-3.5 py-2.5 text-base text-ink"
            />
            {errors.description && <p className="text-sm text-danger-700">{errors.description}</p>}
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Input
              label="Phone"
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
            />
            <Input
              label="Email"
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <Input
              label="Website"
              value={values.website}
              onChange={(e) => set('website', e.target.value)}
              error={errors.website}
              placeholder="https://"
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5 p-6">
          <h2 className="font-semibold text-ink">Location</h2>
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
          <div className="grid gap-5 sm:grid-cols-3">
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
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <div>
            <h2 className="font-semibold text-ink">Categories</h2>
            <p className="text-sm text-muted">The first one you tick is the primary category.</p>
          </div>
          {errors.categoryIds && <p className="text-sm text-danger-700">{errors.categoryIds}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((group) => (
              <fieldset key={group.id} className="flex flex-col gap-1.5">
                <legend className="mb-1 text-sm font-medium text-ink">{group.name}</legend>
                {group.children.map((category) => {
                  const position = values.categoryIds.indexOf(category.id);
                  return (
                    <label key={category.id} className="flex items-center gap-2 text-sm text-body">
                      <input
                        type="checkbox"
                        checked={position >= 0}
                        onChange={(e) => toggle('categoryIds', category.id, e.target.checked)}
                      />
                      {category.name}
                      {position === 0 && <Badge tone="accent">Primary</Badge>}
                      {category.status === 'INACTIVE' && (
                        <span className="text-xs text-muted">(inactive)</span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h2 className="font-semibold text-ink">Amenities</h2>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {amenities
              .filter(
                (amenity) => amenity.status === 'ACTIVE' || values.amenityIds.includes(amenity.id),
              )
              .map((amenity) => (
                <label key={amenity.id} className="flex items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    checked={values.amenityIds.includes(amenity.id)}
                    onChange={(e) => toggle('amenityIds', amenity.id, e.target.checked)}
                  />
                  {amenity.name}
                </label>
              ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Prices</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                set('priceOptions', [
                  ...values.priceOptions,
                  { label: '', amount: '', unit: 'MONTH' },
                ])
              }
            >
              + Add price
            </Button>
          </div>
          {values.priceOptions.length === 0 && <p className="text-sm text-muted">No prices yet.</p>}
          {values.priceOptions.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_8rem_auto] items-end gap-2">
              <Input
                label="Label"
                value={row.label}
                placeholder="e.g. Monthly, veg"
                onChange={(e) =>
                  set(
                    'priceOptions',
                    values.priceOptions.map((other, i) =>
                      i === index ? { ...other, label: e.target.value } : other,
                    ),
                  )
                }
                error={errors[`priceOptions.${index}.label`]}
              />
              <Input
                label="₹"
                type="number"
                value={row.amount}
                onChange={(e) =>
                  set(
                    'priceOptions',
                    values.priceOptions.map((other, i) =>
                      i === index ? { ...other, amount: e.target.value } : other,
                    ),
                  )
                }
                error={errors[`priceOptions.${index}.amount`]}
              />
              <select
                aria-label="Per"
                value={row.unit}
                onChange={(e) =>
                  set(
                    'priceOptions',
                    values.priceOptions.map((other, i) =>
                      i === index ? { ...other, unit: e.target.value as PriceUnit } : other,
                    ),
                  )
                }
                className={`${SELECT_CLASSES} h-11`}
              >
                {PRICE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11"
                aria-label="Remove price"
                onClick={() =>
                  set(
                    'priceOptions',
                    values.priceOptions.filter((_, i) => i !== index),
                  )
                }
              >
                ×
              </Button>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h2 className="font-semibold text-ink">Photos</h2>
          {place && place.images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {place.images.map((image) => (
                <div key={image.id} className="flex w-32 flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API. */}
                  <img src={image.imageUrl} alt="" className="h-24 w-32 rounded-md object-cover" />
                  <div className="flex justify-between text-xs">
                    {image.isCover ? (
                      <span className="font-medium text-success-700">Cover</span>
                    ) : (
                      <button
                        type="button"
                        className="text-action hover:underline"
                        onClick={() =>
                          void imageAction(() => adminService.setPlaceCover(place.id, image.id))
                        }
                      >
                        Make cover
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-danger-700 hover:underline"
                      onClick={() =>
                        void imageAction(() => adminService.removePlaceImage(place.id, image.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ImageUploader
            label={place ? 'Add photos (saved with the form)' : 'Photos'}
            value={newImages}
            onChange={setNewImages}
            max={10}
            onBusyChange={setUploading}
          />
        </Card>

        {!place && (
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
            {place ? 'Save changes' : 'Create place'}
          </Button>
          {saved && <span className="text-sm text-success-700">Saved.</span>}
        </div>
      </form>
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
