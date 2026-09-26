'use client';

import { ApiClientError } from '@platform/api-client';
import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITIONS,
  LISTING_CONDITION_LABELS,
  LISTING_DESCRIPTION_MAX,
  LISTING_IMAGES_MAX,
  LISTING_TITLE_MAX,
  LISTING_VISIBILITIES,
  LISTING_VISIBILITY_LABELS,
  type Listing,
  type ListingCategory,
  type ListingCondition,
  type ListingVisibility,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { ImageUploader } from '@/components/shared/image-uploader';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { firstFieldErrors } from '@/lib/forms/errors';
import { marketplaceService } from '@/services/marketplace.service';

const CARD = 'flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6';
const SELECT =
  'h-11 rounded-md border border-control bg-surface px-3.5 text-base font-normal text-ink';

const VISIBILITY_HINTS: Record<ListingVisibility, string> = {
  MY_COLLEGE: 'Only verified students of your college.',
  NEARBY_COLLEGES: 'Your college and colleges close to it.',
  CITY: 'Every college in your city.',
};

/** Sell something (no `listingId`) or edit one of my listings. */
export function ListingForm({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const { user } = useSession();
  const [loaded, setLoaded] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ListingCategory>('BOOKS');
  const [condition, setCondition] = useState<ListingCondition>('GOOD');
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<ListingVisibility>('NEARBY_COLLEGES');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    const controller = new AbortController();
    marketplaceService
      .listing(listingId, controller.signal)
      .then(({ data }) => {
        if (!data.mine) throw new Error('This is not your listing.');
        setLoaded(data);
        setTitle(data.title);
        setDescription(data.description);
        setCategory(data.category);
        setCondition(data.condition);
        setPrice(String(data.price));
        setNegotiable(data.negotiable);
        setQuantity(String(data.quantity));
        setLocation(data.location ?? '');
        setVisibility(data.visibility);
        setImages(data.images);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(caught instanceof Error ? caught.message : 'Could not load the listing.');
      });
    return () => controller.abort();
  }, [listingId]);

  if (loadError) return <ErrorState message={loadError} />;
  if (listingId && !loaded) return <Skeleton className="h-[36rem] w-full" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const priceNumber = Number(price);
    if (price.trim() === '' || !Number.isInteger(priceNumber) || priceNumber < 0) {
      setErrors({ price: 'Enter a price in whole rupees (0 for free).' });
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    const dto = {
      title: title.trim(),
      description: description.trim(),
      category,
      condition,
      price: priceNumber,
      negotiable,
      quantity: Number(quantity) || 1,
      location: location.trim() || null,
      visibility,
      images,
    };
    try {
      const result = listingId
        ? await marketplaceService.update(listingId, dto)
        : await marketplaceService.create(dto);
      router.push(ROUTES.marketplaceListing(result.data.id));
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors)
        setErrors(firstFieldErrors(caught.fieldErrors));
      else setFormError(caught instanceof ApiClientError ? caught.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">
          {listingId ? 'Edit listing' : 'Sell something'}
        </h1>
        <p className="text-sm text-body">
          Listed under {user?.student.college?.name ?? 'your verified college'}. Buyers message you
          in the app; your phone number and email are never shown.
        </p>
      </div>
      {formError && <FormAlert message={formError} />}

      <section className={CARD}>
        <ImageUploader
          label="Photos"
          hint={`Up to ${LISTING_IMAGES_MAX}. The first is the cover. Real photos sell faster.`}
          value={images}
          onChange={setImages}
          max={LISTING_IMAGES_MAX}
          onBusyChange={setUploading}
          error={errors.images}
        />
      </section>

      <section className={CARD}>
        <Input
          label="Title"
          placeholder="e.g. Engineering Maths (Kreyszig), 10th edition"
          maxLength={LISTING_TITLE_MAX}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={errors.title}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="listing-description" className="text-sm font-medium text-ink">
            Description
          </label>
          <textarea
            id="listing-description"
            rows={5}
            maxLength={LISTING_DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={errors.description ? true : undefined}
            className={`rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink ${
              errors.description ? 'border-danger-600' : 'border-control'
            }`}
          />
          {errors.description && <p className="text-sm text-danger-700">{errors.description}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ListingCategory)}
              className={SELECT}
            >
              {LISTING_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {LISTING_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Condition
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value as ListingCondition)}
              className={SELECT}
            >
              {LISTING_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {LISTING_CONDITION_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={CARD}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Price (₹)"
            inputMode="numeric"
            placeholder="0 for free"
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ''))}
            error={errors.price}
          />
          <Input
            label="Quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ''))}
            error={errors.quantity}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={negotiable}
            onChange={(event) => setNegotiable(event.target.checked)}
            className="size-4 accent-accent-600"
          />
          Price is negotiable
        </label>
        <Input
          label="Pickup point (optional)"
          placeholder="e.g. Main gate, library"
          hint="A public spot on or near campus. Never your room or phone number."
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          error={errors.location}
        />
      </section>

      <fieldset className={CARD}>
        <legend className="sr-only">Who can see it</legend>
        <p className="text-sm font-medium text-ink">Who can see it?</p>
        {LISTING_VISIBILITIES.map((value) => (
          <label key={value} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="visibility"
              checked={visibility === value}
              onChange={() => setVisibility(value)}
              className="mt-1 accent-accent-600"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                {LISTING_VISIBILITY_LABELS[value]}
              </span>
              <span className="block text-xs text-muted">{VISIBILITY_HINTS[value]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" loading={busy} disabled={uploading}>
          {listingId ? 'Save changes' : 'Publish listing'}
        </Button>
        <Link
          href={listingId ? ROUTES.marketplaceListing(listingId) : ROUTES.marketplace}
          className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium text-ink hover:bg-subtle"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
