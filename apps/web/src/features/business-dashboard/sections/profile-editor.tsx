'use client';

import { ApiClientError } from '@platform/api-client';
import {
  updateBusinessProfileRequestSchema,
  type BusinessProfile,
  type CategoryGroup,
} from '@platform/contracts';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { ImageUploader } from '@/components/shared/image-uploader';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { AvatarCropDialog } from '@/features/account/components/avatar-crop-dialog';
import { SELECT_CLASS } from '@/features/auth/components/register-form';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { businessService } from '@/services/business.service';
import { categoriesService } from '@/services/categories.service';
import { uploadsService } from '@/services/uploads.service';
import { SaveBar, useLeaveGuard } from '../unsaved';
import { useWorkspace } from '../workspace';
import { Panel } from './overview';

const FIELDS = [
  'businessName',
  'categoryId',
  'city',
  'description',
  'phone',
  'whatsapp',
  'email',
  'website',
  'instagramUrl',
  'facebookUrl',
  'logoUrl',
  'coverUrl',
] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

const REQUIRED: ReadonlySet<Field> = new Set(['businessName', 'categoryId', 'city']);

const valuesOf = (profile: BusinessProfile): Values => ({
  businessName: profile.businessName,
  categoryId: profile.category?.id ?? '',
  city: profile.city ?? '',
  description: profile.description ?? '',
  phone: profile.phone ?? '',
  whatsapp: profile.whatsapp ?? '',
  email: profile.email ?? '',
  website: profile.website ?? '',
  instagramUrl: profile.instagramUrl ?? '',
  facebookUrl: profile.facebookUrl ?? '',
  logoUrl: profile.logoUrl ?? '',
  coverUrl: profile.coverUrl ?? '',
});

/** Only what changed; an emptied optional field is sent as null (cleared). */
function changesOf(before: Values, after: Values): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const key of FIELDS) {
    if (after[key].trim() === before[key].trim()) continue;
    changes[key] = !REQUIRED.has(key) && after[key].trim() === '' ? null : after[key].trim();
  }
  return changes;
}

const TABS = [
  { id: 'basics', label: 'Basics' },
  { id: 'contact', label: 'Contact & social' },
  { id: 'branding', label: 'Logo & cover' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const TAB_OF: Record<Field, Tab> = {
  businessName: 'basics',
  categoryId: 'basics',
  city: 'basics',
  description: 'basics',
  phone: 'contact',
  whatsapp: 'contact',
  email: 'contact',
  website: 'contact',
  instagramUrl: 'contact',
  facebookUrl: 'contact',
  logoUrl: 'branding',
  coverUrl: 'branding',
};

/**
 * The business profile: what the public page shows about the business itself. Validated as you
 * type (the same rules the server applies), saved in one go, and never lost to a stray reload.
 */
export function ProfileEditor() {
  const toast = useToast();
  const { dashboard, setProfile } = useWorkspace();
  const saved = dashboard.profile;
  const [values, setValues] = useState<Values>(() => valuesOf(saved));
  const [tab, setTab] = useState<Tab>('basics');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState<CategoryGroup[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    categoriesService
      .list(controller.signal)
      .then((result) => setCategories(result.data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const baseline = useMemo(() => valuesOf(saved), [saved]);
  const changes = changesOf(baseline, values);
  const dirty = Object.keys(changes).length > 0;
  useLeaveGuard(dirty);

  // Inline validation: the changed fields, checked against the shared schema as you type.
  const liveErrors = useMemo(() => {
    if (!dirty) return {};
    const parsed = updateBusinessProfileRequestSchema.safeParse(changes);
    return parsed.success ? {} : flattenZodErrors(parsed.error);
  }, [changes, dirty]);
  const errors: Record<string, string> = { ...liveErrors, ...serverErrors };

  const set = (key: Field) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  async function save() {
    setFormError(null);
    const parsed = updateBusinessProfileRequestSchema.safeParse(changes);
    if (!parsed.success) {
      const fieldErrors = flattenZodErrors(parsed.error);
      const first = Object.keys(fieldErrors)[0] as Field | undefined;
      if (first && TAB_OF[first]) setTab(TAB_OF[first]);
      return;
    }
    setSaving(true);
    try {
      const result = await businessService.updateProfile(parsed.data);
      setProfile(result.data);
      setValues(valuesOf(result.data));
      toast.show('Business profile saved');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors) {
        const fieldErrors = firstFieldErrors(caught.fieldErrors);
        setServerErrors(fieldErrors);
        const first = Object.keys(fieldErrors)[0] as Field | undefined;
        if (first && TAB_OF[first]) setTab(TAB_OF[first]);
      } else {
        setFormError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not save. Please try again.' },
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const tabHasError = (id: Tab) => Object.keys(errors).some((key) => TAB_OF[key as Field] === id);

  return (
    <>
      <PageHeader
        title="Business profile"
        description="What students see about your business on your page. Your link never changes, even if you rename."
      />
      <div
        role="tablist"
        aria-label="Profile sections"
        className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-subtle p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === item.id ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'}`}
          >
            {item.label}
            {tabHasError(item.id) && (
              <span className="size-1.5 rounded-full bg-danger-600" aria-label="has errors" />
            )}
          </button>
        ))}
      </div>

      {formError && (
        <div className="mb-4">
          <FormAlert message={formError.message} requestId={formError.requestId} />
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        noValidate
      >
        {tab === 'basics' && (
          <Panel>
            <div className="flex flex-col gap-5">
              <Input
                label="Business name"
                value={values.businessName}
                onChange={(e) => set('businessName')(e.target.value)}
                error={errors.businessName}
                autoComplete="organization"
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="categoryId" className="text-sm font-medium text-ink">
                    Category
                  </label>
                  <select
                    id="categoryId"
                    value={values.categoryId}
                    onChange={(e) => set('categoryId')(e.target.value)}
                    disabled={!categories}
                    className={`${SELECT_CLASS} ${errors.categoryId ? 'border-danger-600' : 'border-control'}`}
                  >
                    {!values.categoryId && <option value="">Choose a category</option>}
                    {!categories && saved.category && (
                      <option value={saved.category.id}>{saved.category.name}</option>
                    )}
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
                  {errors.categoryId && (
                    <p className="text-sm text-danger-700">{errors.categoryId}</p>
                  )}
                </div>
                <Input
                  label="City"
                  value={values.city}
                  onChange={(e) => set('city')(e.target.value)}
                  error={errors.city}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="description"
                  className="flex justify-between text-sm font-medium text-ink"
                >
                  About your business
                  <span className="font-normal text-muted">{values.description.length}/2000</span>
                </label>
                <textarea
                  id="description"
                  rows={6}
                  maxLength={2000}
                  value={values.description}
                  onChange={(e) => set('description')(e.target.value)}
                  placeholder="What makes you the right choice for students: food, facilities, prices, timings…"
                  className={`rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted ${errors.description ? 'border-danger-600' : 'border-control'}`}
                />
                {errors.description && (
                  <p className="text-sm text-danger-700">{errors.description}</p>
                )}
              </div>
            </div>
          </Panel>
        )}

        {tab === 'contact' && (
          <Panel>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Phone"
                type="tel"
                value={values.phone}
                onChange={(e) => set('phone')(e.target.value)}
                error={errors.phone}
                hint="Students tap to call."
              />
              <div className="flex flex-col gap-1.5">
                <Input
                  label="WhatsApp"
                  type="tel"
                  value={values.whatsapp}
                  onChange={(e) => set('whatsapp')(e.target.value)}
                  error={errors.whatsapp}
                  hint="Opens a chat with you."
                />
                {values.phone && values.whatsapp !== values.phone && (
                  <button
                    type="button"
                    onClick={() => set('whatsapp')(values.phone)}
                    className="w-fit text-xs font-medium text-action"
                  >
                    Same as phone
                  </button>
                )}
              </div>
              <Input
                label="Public email"
                type="email"
                value={values.email}
                onChange={(e) => set('email')(e.target.value)}
                error={errors.email}
                hint="Shown on your page. Leave empty to keep it private."
              />
              <Input
                label="Website"
                type="url"
                placeholder="https://"
                value={values.website}
                onChange={(e) => set('website')(e.target.value)}
                error={errors.website}
              />
              <Input
                label="Instagram"
                type="url"
                placeholder="https://instagram.com/yourpage"
                value={values.instagramUrl}
                onChange={(e) => set('instagramUrl')(e.target.value)}
                error={errors.instagramUrl}
              />
              <Input
                label="Facebook"
                type="url"
                placeholder="https://facebook.com/yourpage"
                value={values.facebookUrl}
                onChange={(e) => set('facebookUrl')(e.target.value)}
                error={errors.facebookUrl}
              />
            </div>
          </Panel>
        )}

        {tab === 'branding' && (
          <Panel>
            <div className="flex flex-col gap-8">
              <LogoPicker
                name={values.businessName}
                url={values.logoUrl}
                onChange={(url) => set('logoUrl')(url)}
                error={errors.logoUrl}
              />
              <div className="flex flex-col gap-3">
                <ImageUploader
                  label="Cover image"
                  value={values.coverUrl ? [values.coverUrl] : []}
                  onChange={(urls) => set('coverUrl')(urls[0] ?? '')}
                  max={1}
                  hint="The wide banner at the top of your page. Landscape, at least 1600 × 600."
                  error={errors.coverUrl}
                  onBusyChange={setUploading}
                />
                {values.coverUrl && (
                  <div className="aspect-[16/5] overflow-hidden rounded-xl border border-line bg-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API. */}
                    <img
                      src={values.coverUrl}
                      alt="Cover preview"
                      className="size-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          </Panel>
        )}

        <SaveBar
          dirty={dirty}
          saving={saving}
          disabled={uploading || Object.keys(liveErrors).length > 0}
          onSave={() => void save()}
          onDiscard={() => {
            setValues(baseline);
            setServerErrors({});
            setFormError(null);
          }}
        />
      </form>
    </>
  );
}

/**
 * The business logo: pick an image, crop it to a square, and it is uploaded straight away (the URL
 * is saved with the rest of the profile). The same cropper as profile photos, with a square frame.
 */
function LogoPicker({
  name,
  url,
  onChange,
  error,
}: {
  name: string;
  url: string;
  onChange: (url: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);

  async function save(file: File) {
    try {
      onChange((await uploadsService.uploadImage(file)).data.url);
    } catch (caught) {
      throw new Error(
        caught instanceof ApiClientError ? caught.message : 'Could not upload the logo.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">Logo</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={url ? 'Change logo' : 'Add a logo'}
          className="group relative size-24 shrink-0 overflow-hidden rounded-xl border border-line bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-3xl font-bold text-primary-700">
              {name.trim().charAt(0).toUpperCase() || '+'}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            {url ? 'Change' : 'Add'}
          </span>
        </button>
        <div className="flex flex-col items-start gap-1 text-sm">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-medium text-action hover:text-action-hover"
          >
            {url ? 'Change logo' : 'Upload a logo'}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs font-medium text-muted hover:text-danger-700"
            >
              Remove logo
            </button>
          )}
          <span className="text-xs text-muted">You crop it to a square. Save to publish it.</span>
        </div>
      </div>
      {error && <p className="text-sm text-danger-700">{error}</p>}
      <AvatarCropDialog
        open={open}
        onClose={() => setOpen(false)}
        onSave={save}
        title="Business logo"
        hint="Choose your logo or a clear photo of your shop front."
        shape="square"
        saveLabel="Save logo"
      />
    </div>
  );
}
