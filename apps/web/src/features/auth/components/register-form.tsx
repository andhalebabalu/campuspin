'use client';

import { ApiClientError } from '@platform/api-client';
import { registerRequestSchema, type AccountType } from '@platform/contracts';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { useSession } from '@/lib/auth/session-context';

interface RegisterValues {
  name: string;
  email: string;
  password: string;
  businessName: string;
}

const INITIAL: RegisterValues = { name: '', email: '', password: '', businessName: '' };

const ACCOUNT_CHOICES: ReadonlyArray<{
  type: AccountType;
  icon: IconName;
  title: string;
  description: string;
}> = [
  {
    type: 'STUDENT',
    icon: 'user',
    title: "I'm a student",
    description: 'Find messes, PGs, libraries and more around your college. Save, review, enquire.',
  },
  {
    type: 'BUSINESS',
    icon: 'store',
    title: 'I run a business',
    description:
      'List your place, answer student enquiries and follow your reviews on a dashboard.',
  },
];

/**
 * Sign-up in two steps: first who you are (student or business), then the details. A business
 * account also names its business; it gets the business dashboard instead of the student features.
 */
export function RegisterForm({ initialType = null }: { initialType?: AccountType | null }) {
  const router = useRouter();
  const { register } = useSession();
  const [accountType, setAccountType] = useState<AccountType | null>(initialType);
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!accountType) {
    return (
      <div className="flex flex-col gap-3">
        {ACCOUNT_CHOICES.map((choice) => (
          <button
            key={choice.type}
            type="button"
            onClick={() => setAccountType(choice.type)}
            className="flex items-start gap-4 rounded-lg border border-line bg-surface p-5 text-left transition-colors hover:border-primary-400 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
              <Icon name={choice.icon} className="size-5" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-ink">{choice.title}</span>
              <span className="text-sm text-body">{choice.description}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  const isBusiness = accountType === 'BUSINESS';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerRequestSchema.safeParse({
      name: values.name,
      email: values.email,
      password: values.password,
      accountType,
      ...(isBusiness ? { businessName: values.businessName } : {}),
    });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
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

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 rounded-md bg-subtle px-4 py-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-ink">
          <Icon name={isBusiness ? 'store' : 'user'} className="size-4" />
          {isBusiness ? 'Business account' : 'Student account'}
        </span>
        <button
          type="button"
          onClick={() => {
            setAccountType(null);
            setErrors({});
            setFormError(null);
          }}
          className="font-medium text-action hover:text-action-hover"
        >
          Change
        </button>
      </div>

      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
      {isBusiness && (
        <Input
          label="Business name"
          autoComplete="organization"
          value={values.businessName}
          onChange={(event) => setValues((v) => ({ ...v, businessName: event.target.value }))}
          error={errors.businessName}
          hint="As students know it, e.g. “Sai Krupa Mess”. You can add your places after signing up."
        />
      )}
      <Input
        label={isBusiness ? 'Your name' : 'Full name'}
        autoComplete="name"
        value={values.name}
        onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        error={errors.name}
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
        error={errors.email}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters mixing letters, numbers or symbols (or a 16+ character passphrase)."
        value={values.password}
        onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        error={errors.password}
      />
      <Button type="submit" loading={submitting} fullWidth>
        {isBusiness ? 'Create business account' : 'Create account'}
      </Button>
    </form>
  );
}
