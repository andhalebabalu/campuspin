'use client';

import { ApiClientError } from '@platform/api-client';
import { forgotPasswordRequestSchema } from '@platform/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { authService } from '@/services/auth.service';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      await authService.forgotPassword(parsed.data);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError({ message: error.message, requestId: error.requestId });
      } else {
        setFormError({ message: 'Something went wrong. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body">
          If an account exists for <strong className="text-ink">{email}</strong>, a password reset
          link has been sent.
        </p>
        <Link
          href={ROUTES.signIn}
          className="text-sm font-medium text-action hover:text-action-hover"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error}
      />
      <Button type="submit" loading={submitting} fullWidth>
        Send reset link
      </Button>
    </form>
  );
}
