'use client';

import { ApiClientError } from '@platform/api-client';
import {
  updateBusinessProfileRequestSchema,
  type BusinessProfile,
  type UpdateBusinessProfileRequest,
} from '@platform/contracts';
import { useState, type FormEvent } from 'react';
import { ImageUploader } from '@/components/shared/image-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { businessService } from '@/services/business.service';

interface ProfileValues {
  businessName: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
}

const valuesOf = (profile: BusinessProfile): ProfileValues => ({
  businessName: profile.businessName,
  description: profile.description ?? '',
  phone: profile.phone ?? '',
  email: profile.email ?? '',
  website: profile.website ?? '',
  logoUrl: profile.logoUrl ?? '',
});

/** Only the fields that changed; an emptied optional field is sent as `null` (clear it). */
function changesOf(before: ProfileValues, after: ProfileValues): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const key of Object.keys(after) as Array<keyof ProfileValues>) {
    if (after[key].trim() === before[key].trim()) continue;
    changes[key] = key !== 'businessName' && after[key].trim() === '' ? null : after[key];
  }
  return changes;
}

/** Edit the business profile students see alongside the business's places. */
export function ProfilePanel({
  profile,
  onSaved,
}: {
  profile: BusinessProfile;
  onSaved: (profile: BusinessProfile) => void;
}) {
  const [values, setValues] = useState(() => valuesOf(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const changes = changesOf(valuesOf(profile), values);
  const dirty = Object.keys(changes).length > 0;

  function update(key: keyof ProfileValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = updateBusinessProfileRequestSchema.safeParse(changes);
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await businessService.updateProfile(
        parsed.data satisfies UpdateBusinessProfileRequest,
      );
      onSaved(result.data);
      setValues(valuesOf(result.data));
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors) {
        setErrors(firstFieldErrors(caught.fieldErrors));
      } else {
        setFormError({
          message:
            caught instanceof ApiClientError ? caught.message : 'Could not save the profile.',
          requestId: caught instanceof ApiClientError ? caught.requestId : undefined,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
      <div className="flex items-center gap-2 text-sm text-body">
        Verification:
        <Badge tone={profile.verificationStatus === 'VERIFIED' ? 'success' : 'neutral'}>
          {profile.verificationStatus === 'VERIFIED' ? 'Verified business' : 'Not verified yet'}
        </Badge>
      </div>

      <ImageUploader
        label="Logo"
        value={values.logoUrl ? [values.logoUrl] : []}
        onChange={(urls) => update('logoUrl', urls[0] ?? '')}
        max={1}
        onBusyChange={setUploading}
        hint="A square image works best. JPEG, PNG or WebP, up to 5 MB."
        error={errors.logoUrl}
      />
      <Input
        label="Business name"
        value={values.businessName}
        onChange={(event) => update('businessName', event.target.value)}
        error={errors.businessName}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="business-description" className="text-sm font-medium text-ink">
          About your business
        </label>
        <textarea
          id="business-description"
          rows={4}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="What you offer, timings, what makes you different…"
          className="rounded-md border border-control bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted"
        />
        {errors.description && <p className="text-sm text-danger-700">{errors.description}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Phone"
          type="tel"
          value={values.phone}
          onChange={(event) => update('phone', event.target.value)}
          error={errors.phone}
        />
        <Input
          label="Contact email"
          type="email"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          error={errors.email}
        />
      </div>
      <Input
        label="Website (optional)"
        type="url"
        value={values.website}
        onChange={(event) => update('website', event.target.value)}
        error={errors.website}
        placeholder="https://"
      />

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving} disabled={!dirty || uploading}>
          Save changes
        </Button>
        {saved && !dirty && <span className="text-sm text-success-700">Saved.</span>}
      </div>
    </form>
  );
}
