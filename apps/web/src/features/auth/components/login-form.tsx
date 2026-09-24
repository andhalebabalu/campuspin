'use client';

import { ApiClientError } from '@platform/api-client';
import { loginRequestSchema, type RoleKey } from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { flattenZodErrors } from '@/lib/forms/errors';
import { useSession } from '@/lib/auth/session-context';

interface LoginValues {
  email: string;
  password: string;
}

const INITIAL: LoginValues = { email: '', password: '' };

/**
 * `?next=` only ever leads to a page on this site: a path, never `//other.site` or `/\other.site`
 * (both of which a browser treats as another origin), so the login page cannot be used to bounce
 * people to a phishing page.
 */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  return next;
}

/** Where to land after signing in when no `next` was given. */
function homeFor(roles: readonly RoleKey[]): string {
  return roles.includes('BUSINESS_OWNER') ? ROUTES.dashboard : ROUTES.home;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { login } = useSession();
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setUnverifiedEmail(null);

    const parsed = loginRequestSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const user = await login(parsed.data);
      router.push(safeNext(next) ?? homeFor(user.roles));
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(parsed.data.email);
          setFormError({ message: error.message });
        } else if (error.fieldErrors) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.fieldErrors).map(([key, messages]) => [key, messages[0] ?? '']),
            ),
          );
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
      {formError && (
        <FormAlert message={formError.message} requestId={formError.requestId}>
          {unverifiedEmail && (
            <Link
              href={`${ROUTES.verifyEmail}?email=${encodeURIComponent(unverifiedEmail)}`}
              className="font-medium underline"
            >
              Resend verification email
            </Link>
          )}
        </FormAlert>
      )}
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
        autoComplete="current-password"
        value={values.password}
        onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        error={errors.password}
      />
      <Button type="submit" loading={submitting} fullWidth>
        Sign in
      </Button>
    </form>
  );
}
