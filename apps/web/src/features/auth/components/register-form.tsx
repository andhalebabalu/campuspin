'use client';

import { ApiClientError } from '@platform/api-client';
import {
  PAGE_LIMIT_MAX,
  registerRequestSchema,
  type AccountType,
  type CategoryGroup,
  type CollegeCard,
} from '@platform/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { useSession } from '@/lib/auth/session-context';
import { categoriesService } from '@/services/categories.service';
import { collegesService } from '@/services/colleges.service';

interface RegisterValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  collegeId: string;
  businessName: string;
  categoryId: string;
  phone: string;
  city: string;
  description: string;
}

const INITIAL: RegisterValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  collegeId: '',
  businessName: '',
  categoryId: '',
  phone: '',
  city: 'Ahilyanagar',
  description: '',
};

export const SELECT_CLASS =
  'h-11 rounded-md border bg-surface px-3.5 text-base text-ink disabled:opacity-60';

/**
 * Sign-up for one account type. A student names their college (optional); a business gives what
 * students need to find it (category, phone, city). Both confirm their email before signing in.
 */
export function RegisterForm({ accountType }: { accountType: AccountType }) {
  const router = useRouter();
  const { register } = useSession();
  const isBusiness = accountType === 'BUSINESS';
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<CategoryGroup[] | null>(null);
  const [colleges, setColleges] = useState<CollegeCard[] | null>(null);
  const [optionsError, setOptionsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = isBusiness
      ? categoriesService.list(controller.signal).then((result) => setCategories(result.data))
      : collegesService
          .list({ limit: PAGE_LIMIT_MAX }, controller.signal)
          .then((result) => setColleges(result.data));
    load.catch(() => {
      if (!controller.signal.aborted) setOptionsError(true);
    });
    return () => controller.abort();
  }, [isBusiness]);

  const set = (key: keyof RegisterValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerRequestSchema.safeParse({
      name: values.name,
      email: values.email,
      password: values.password,
      accountType,
      ...(isBusiness
        ? {
            businessName: values.businessName,
            categoryId: values.categoryId || undefined,
            phone: values.phone || undefined,
            city: values.city || undefined,
            description: values.description.trim() || undefined,
          }
        : { collegeId: values.collegeId || undefined }),
    });
    const fieldErrors = parsed.success ? {} : flattenZodErrors(parsed.error);
    if (values.password && values.confirmPassword !== values.password) {
      fieldErrors.confirmPassword = 'The passwords do not match';
    }
    if (!parsed.success || Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await register(parsed.data);
      router.push(`${ROUTES.verifyEmail}?email=${encodeURIComponent(parsed.data.email)}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.fieldErrors) {
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

  const passwordFields = (
    <div className="grid gap-5 sm:grid-cols-2">
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => set('password')(event.target.value)}
        error={errors.password}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(event) => set('confirmPassword')(event.target.value)}
        error={errors.confirmPassword}
      />
      {!errors.password && (
        <p className="-mt-3 text-sm text-muted sm:col-span-2">
          At least 10 characters mixing letters, numbers or symbols (or a 16+ character passphrase).
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}

      {isBusiness ? (
        <>
          <Input
            label="Business name"
            autoComplete="organization"
            placeholder="e.g. Shree Ganesh Student Mess"
            value={values.businessName}
            onChange={(event) => set('businessName')(event.target.value)}
            error={errors.businessName}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoryId" className="text-sm font-medium text-ink">
                Business category
              </label>
              <select
                id="categoryId"
                value={values.categoryId}
                onChange={(event) => set('categoryId')(event.target.value)}
                disabled={!categories}
                aria-invalid={errors.categoryId ? true : undefined}
                className={`${SELECT_CLASS} ${errors.categoryId ? 'border-danger-600' : 'border-control'}`}
              >
                <option value="">{categories ? 'Choose a category' : 'Loading…'}</option>
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
              autoComplete="address-level2"
              value={values.city}
              onChange={(event) => set('city')(event.target.value)}
              error={errors.city}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Your name"
              autoComplete="name"
              value={values.name}
              onChange={(event) => set('name')(event.target.value)}
              error={errors.name}
            />
            <Input
              label="Phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={values.phone}
              onChange={(event) => set('phone')(event.target.value)}
              error={errors.phone}
            />
          </div>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => set('email')(event.target.value)}
            error={errors.email}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-medium text-ink">
              Short description <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={3}
              maxLength={1000}
              placeholder="What students get: e.g. home-style veg thali, monthly plans, near the college gate."
              value={values.description}
              onChange={(event) => set('description')(event.target.value)}
              className="rounded-md border border-control bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted"
            />
            {errors.description && (
              <p className="text-sm text-danger-700">{errors.description}</p>
            )}
          </div>
          {passwordFields}
          <p className="text-sm text-muted">
            After you confirm your email, add your location and photos. Our team reviews every new
            business before its page goes live.
          </p>
        </>
      ) : (
        <>
          <Input
            label="Full name"
            autoComplete="name"
            value={values.name}
            onChange={(event) => set('name')(event.target.value)}
            error={errors.name}
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => set('email')(event.target.value)}
            error={errors.email}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="collegeId" className="text-sm font-medium text-ink">
              College <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              id="collegeId"
              value={values.collegeId}
              onChange={(event) => set('collegeId')(event.target.value)}
              disabled={!colleges}
              className={`${SELECT_CLASS} ${errors.collegeId ? 'border-danger-600' : 'border-control'}`}
            >
              <option value="">{colleges ? 'Choose later' : 'Loading…'}</option>
              {colleges?.map((college) => (
                <option key={college.id} value={college.id}>
                  {college.name}, {college.city}
                </option>
              ))}
            </select>
            {errors.collegeId ? (
              <p className="text-sm text-danger-700">{errors.collegeId}</p>
            ) : (
              <p className="text-sm text-muted">
                Shows places near it first. Verify your student ID later from your profile.
              </p>
            )}
          </div>
          {passwordFields}
        </>
      )}

      {optionsError && (
        <p className="text-sm text-danger-700">
          Could not load the {isBusiness ? 'categories' : 'colleges'}. Reload the page.
        </p>
      )}

      <Button type="submit" loading={submitting} fullWidth>
        {isBusiness ? 'Create business account' : 'Create student account'}
      </Button>
    </form>
  );
}
