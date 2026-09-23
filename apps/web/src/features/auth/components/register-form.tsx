'use client';

import { ApiClientError } from '@platform/api-client';
import { registerRequestSchema } from '@platform/contracts';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { useSession } from '@/lib/auth/session-context';

interface RegisterValues {
  name: string;
  email: string;
  password: string;
}

const INITIAL: RegisterValues = { name: '', email: '', password: '' };

export function RegisterForm() {
  const router = useRouter();
  const { register } = useSession();
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerRequestSchema.safeParse(values);
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
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
      <Input
        label="Full name"
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
        Create account
      </Button>
    </form>
  );
}
