'use client';

import { ApiClientError } from '@platform/api-client';
import {
  MAX_REVIEW_COMMENT_LENGTH,
  createReviewRequestSchema,
  updateReviewRequestSchema,
  type RatingDimensionSummary,
  type Review,
} from '@platform/contracts';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { reviewsService } from '@/services/reviews.service';
import { StarInput } from './stars';

export interface ReviewFormProps {
  placeId: string;
  /** Every dimension a reviewer of this place may rate (from the summary endpoint). */
  dimensions: RatingDimensionSummary[];
  /** Set when editing: the form starts from it and saves with PATCH instead of POST. */
  existing?: Review;
  onSaved: (review: Review) => void;
  onCancel?: () => void;
}

/**
 * Write or edit a review. Validated with the same shared schema the API uses before sending; the
 * API's own field errors (for example a dimension that does not belong to the place) are shown under
 * the matching field.
 */
export function ReviewForm({ placeId, dimensions, existing, onSaved, onCancel }: ReviewFormProps) {
  const commentId = useId();
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [dimensionRatings, setDimensionRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (existing?.dimensionRatings ?? []).map((entry) => [entry.dimensionId, entry.rating]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const ratings = Object.entries(dimensionRatings).map(([dimensionId, value]) => ({
      dimensionId,
      rating: value,
    }));
    if (rating === null) {
      setErrors({ rating: 'Pick a star rating' });
      return;
    }
    const trimmed = comment.trim();
    let send: () => Promise<{ data: Review }>;
    if (existing) {
      // Editing sends every field, so clearing the comment or a dimension really clears it.
      const parsed = updateReviewRequestSchema.safeParse({
        rating,
        comment: trimmed || null,
        dimensionRatings: ratings,
      });
      if (!parsed.success) {
        setErrors(flattenZodErrors(parsed.error));
        return;
      }
      send = () => reviewsService.update(existing.id, parsed.data);
    } else {
      const parsed = createReviewRequestSchema.safeParse({
        rating,
        comment: trimmed || undefined,
        dimensionRatings: ratings,
      });
      if (!parsed.success) {
        setErrors(flattenZodErrors(parsed.error));
        return;
      }
      send = () => reviewsService.create(placeId, parsed.data);
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await send();
      onSaved(result.data);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.fieldErrors) setErrors(firstFieldErrors(error.fieldErrors));
        else setFormError({ message: error.message, requestId: error.requestId });
      } else {
        setFormError({ message: 'Something went wrong. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}

      <StarInput
        label="Your rating"
        value={rating}
        onChange={(value) => {
          setRating(value);
          setErrors((current) => {
            const next = { ...current };
            delete next.rating;
            return next;
          });
        }}
        error={errors.rating}
      />

      {dimensions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {dimensions.map((dimension) => (
            <StarInput
              key={dimension.id}
              label={dimension.label}
              optional
              value={dimensionRatings[dimension.id] ?? null}
              onChange={(value) =>
                setDimensionRatings((current) => ({ ...current, [dimension.id]: value }))
              }
            />
          ))}
          {errors.dimensionRatings && (
            <p className="text-sm text-danger-700 sm:col-span-2">{errors.dimensionRatings}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={commentId} className="text-sm font-medium text-ink">
          Your review <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={commentId}
          rows={4}
          maxLength={MAX_REVIEW_COMMENT_LENGTH}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What should other students know? Food, price, crowd, staff…"
          aria-invalid={errors.comment ? true : undefined}
          className={`rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted ${
            errors.comment ? 'border-danger-600' : 'border-control'
          }`}
        />
        <p className="text-sm text-muted">
          {comment.length} / {MAX_REVIEW_COMMENT_LENGTH}
        </p>
        {errors.comment && <p className="text-sm text-danger-700">{errors.comment}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>
          {existing ? 'Save changes' : 'Post review'}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
