'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PRICE_UNITS,
  createSubmissionRequestSchema,
  duplicateCandidateSchema,
  duplicateCheckRequestSchema,
  type CategoryGroup,
  type DuplicateCandidate,
  type PlaceSubmission,
  type PriceUnit,
} from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ImageUploader } from '@/components/shared/image-uploader';
import { MapPicker } from '@/components/shared/map-picker';
import { ROUTES } from '@/constants/routes';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { businessService } from '@/services/business.service';
import { categoriesService } from '@/services/categories.service';
import { submissionsService } from '@/services/submissions.service';
import { UNIT_LABELS } from '@/utils/format-price';

interface FormValues {
  name: string;
  categoryId: string;
  address: string;
  city: string;
  latitude: string;
  longitude: string;
  phone: string;
  priceAmount: string;
  priceUnit: PriceUnit | '';
  description: string;
  imageUrls: string[];
}

const INITIAL: FormValues = {
  name: '',
  categoryId: '',
  address: '',
  city: '',
  latitude: '',
  longitude: '',
  phone: '',
  priceAmount: '',
  priceUnit: '',
  description: '',
  imageUrls: [],
};

/** Up to this many photos from the form (the API allows more; five is plenty for a first look). */
const MAX_FORM_IMAGES = 5;

/**
 * `student`: "suggest a place" (`POST /place-submissions`). `business`: an owner listing their own
 * place (`POST /business/listings`). Same fields, same duplicate check, same staff review.
 */
export type SuggestPlaceVariant = 'student' | 'business';

function toDuplicateCheckInput(values: FormValues) {
  return {
    name: values.name,
    categoryId: values.categoryId,
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    address: values.address || undefined,
    phone: values.phone || undefined,
  };
}

function toCreateInput(values: FormValues, confirmDifferent: boolean) {
  return {
    name: values.name,
    categoryId: values.categoryId,
    address: values.address,
    city: values.city || undefined,
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    phone: values.phone || undefined,
    priceAmount: values.priceAmount ? Number(values.priceAmount) : undefined,
    priceUnit: values.priceUnit || undefined,
    description: values.description || undefined,
    images: values.imageUrls.map((imageUrl) => ({ imageUrl })),
    confirmDifferent,
  };
}

function candidatesFromDetails(details: Record<string, unknown> | undefined): DuplicateCandidate[] {
  const parsed = z.array(duplicateCandidateSchema).safeParse(details?.candidates);
  return parsed.success ? parsed.data : [];
}

const selectClass =
  'h-11 rounded-md border bg-surface px-3.5 text-base text-ink disabled:text-muted';

export function SuggestPlaceForm({ variant = 'student' }: { variant?: SuggestPlaceVariant }) {
  const isBusiness = variant === 'business';
  const [categories, setCategories] = useState<CategoryGroup[] | null>(null);
  const [categoriesError, setCategoriesError] = useState(false);

  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<PlaceSubmission | null>(null);
  const [uploading, setUploading] = useState(false);

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [confirmDifferent, setConfirmDifferent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    categoriesService
      .list()
      .then((result) => {
        if (!cancelled) setCategories(result.data);
      })
      .catch(() => {
        if (!cancelled) setCategoriesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    // Any edit invalidates a previous check: it was scored against a different suggestion.
    setCandidates(null);
    setConfirmDifferent(false);
  }

  async function handleCheck() {
    setCheckError(null);
    const parsed = duplicateCheckRequestSchema.safeParse(toDuplicateCheckInput(values));
    if (!parsed.success) {
      setCheckError('Enter a name, pick a category and drop the pin on the map first.');
      return;
    }
    setChecking(true);
    try {
      const result = await submissionsService.duplicateCheck(parsed.data);
      setCandidates(result.data.candidates);
    } catch (error) {
      setCheckError(
        error instanceof ApiClientError ? error.message : 'Could not check for duplicates.',
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = createSubmissionRequestSchema.safeParse(toCreateInput(values, confirmDifferent));
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = isBusiness
        ? await businessService.createListing(parsed.data)
        : await submissionsService.create(parsed.data);
      setSubmitted(result.data);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'DUPLICATE_PLACE_SUSPECTED') {
          setCandidates(candidatesFromDetails(error.details));
          setFormError({ message: error.message });
        } else if (error.fieldErrors) {
          setErrors(firstFieldErrors(error.fieldErrors));
        } else {
          setFormError({ message: error.message, requestId: error.requestId });
        }
      } else {
        setFormError({ message: 'Something went wrong. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SuccessPanel
        submission={submitted}
        variant={variant}
        onSuggestAnother={() => {
          setSubmitted(null);
          setValues(INITIAL);
          setCandidates(null);
          setConfirmDifferent(false);
        }}
      />
    );
  }

  const blockedCandidate = candidates?.some((candidate) => candidate.level === 'block') ?? false;
  const canCheck =
    values.name.trim() !== '' &&
    values.categoryId !== '' &&
    values.latitude !== '' &&
    values.longitude !== '';

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-6">
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}

      <div className="flex flex-col gap-5">
        <Input
          label="Name"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          error={errors.name}
          placeholder="e.g. Sample Mess"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className="text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="category"
            value={values.categoryId}
            onChange={(event) => update('categoryId', event.target.value)}
            disabled={!categories}
            className={`${selectClass} ${errors.categoryId ? 'border-danger-600' : 'border-control'}`}
          >
            <option value="">{categories ? 'Select a category' : 'Loading categories…'}</option>
            {categories?.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.children.map((leaf) => (
                  <option key={leaf.id} value={leaf.id}>
                    {leaf.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {categoriesError && (
            <p className="text-sm text-danger-700">Could not load categories. Reload the page.</p>
          )}
          {errors.categoryId && <p className="text-sm text-danger-700">{errors.categoryId}</p>}
        </div>

        <Input
          label="Address"
          value={values.address}
          onChange={(event) => update('address', event.target.value)}
          error={errors.address}
          placeholder="Street, landmark"
        />
        <Input
          label="City"
          value={values.city}
          onChange={(event) => update('city', event.target.value)}
          error={errors.city}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Location on the map</span>
          <MapPicker
            value={
              values.latitude !== '' && values.longitude !== ''
                ? { latitude: Number(values.latitude), longitude: Number(values.longitude) }
                : null
            }
            onChange={(point) => {
              update('latitude', String(point.latitude));
              update('longitude', String(point.longitude));
            }}
            onAddressFound={(found) => {
              // Fill only what the user has not typed themselves.
              setValues((current) => ({
                ...current,
                address: current.address || found.street,
                city: current.city || found.city,
              }));
            }}
            error={errors.latitude ?? errors.longitude}
          />
        </div>

        <Input
          label="Phone (optional)"
          value={values.phone}
          onChange={(event) => update('phone', event.target.value)}
          error={errors.phone}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Price (optional)"
            type="number"
            value={values.priceAmount}
            onChange={(event) => update('priceAmount', event.target.value)}
            error={errors.priceAmount}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="priceUnit" className="text-sm font-medium text-ink">
              Per
            </label>
            <select
              id="priceUnit"
              value={values.priceUnit}
              onChange={(event) => update('priceUnit', event.target.value as PriceUnit | '')}
              className={`${selectClass} border-control`}
            >
              <option value="">—</option>
              {PRICE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABELS[unit]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ImageUploader
          label="Photos (optional)"
          value={values.imageUrls}
          onChange={(urls) => update('imageUrls', urls)}
          max={MAX_FORM_IMAGES}
          onBusyChange={setUploading}
          error={errors['images.0.imageUrl']}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-ink">
            Description (optional)
          </label>
          <textarea
            id="description"
            rows={4}
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
            className="rounded-md border border-control bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-subtle/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">Check whether this place is already listed</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={checking}
            disabled={!canCheck}
            onClick={() => void handleCheck()}
          >
            Check for duplicates
          </Button>
        </div>
        {checkError && <p className="text-sm text-danger-700">{checkError}</p>}
        {candidates && candidates.length === 0 && (
          <p className="text-sm text-body">No similar places found nearby.</p>
        )}
        {candidates && candidates.length > 0 && (
          <div className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <CandidateCard key={candidate.placeId} candidate={candidate} />
            ))}
            {blockedCandidate && (
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={confirmDifferent}
                  onChange={(event) => setConfirmDifferent(event.target.checked)}
                  className="mt-0.5"
                />
                Yes, this is a different place — I want to {isBusiness ? 'list' : 'suggest'} it
                anyway
              </label>
            )}
          </div>
        )}
      </div>

      <Button
        type="submit"
        loading={submitting}
        disabled={uploading || (blockedCandidate && !confirmDifferent)}
        fullWidth
      >
        {uploading
          ? 'Waiting for photos…'
          : isBusiness
            ? 'Submit listing for review'
            : 'Submit suggestion'}
      </Button>
    </form>
  );
}

function CandidateCard({ candidate }: { candidate: DuplicateCandidate }) {
  return (
    <Card className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-ink">{candidate.name}</p>
        <p className="text-sm text-body">{candidate.reasons.join(' · ')}</p>
      </div>
      <Badge tone={candidate.level === 'block' ? 'danger' : 'accent'}>
        {candidate.level === 'block' ? 'Possible duplicate' : 'Similar place'}
      </Badge>
    </Card>
  );
}

function SuccessPanel({
  submission,
  variant,
  onSuggestAnother,
}: {
  submission: PlaceSubmission;
  variant: SuggestPlaceVariant;
  onSuggestAnother: () => void;
}) {
  if (variant === 'business') {
    return (
      <Card className="flex flex-col items-start gap-4 p-6">
        <Badge tone="accent">Under review</Badge>
        <h2 className="text-xl font-semibold text-ink">Listing submitted</h2>
        <p className="text-body">
          <span className="font-medium text-ink">{submission.name}</span> goes live as soon as our
          team approves it. You can follow its status on your dashboard.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={ROUTES.dashboard}
            className="inline-flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white transition-colors hover:bg-action-hover"
          >
            Back to dashboard
          </Link>
          <Button variant="secondary" onClick={onSuggestAnother}>
            List another place
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-start gap-4 p-6">
      <Badge tone="success">Submitted</Badge>
      <h2 className="text-xl font-semibold text-ink">Thanks for the suggestion!</h2>
      <p className="text-body">
        <span className="font-medium text-ink">{submission.name}</span> is now waiting for staff
        review. We&apos;ll let you know once it&apos;s approved.
      </p>
      <Button variant="secondary" onClick={onSuggestAnother}>
        Suggest another place
      </Button>
    </Card>
  );
}
