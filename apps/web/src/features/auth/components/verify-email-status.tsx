'use client';

import { ApiClientError } from '@platform/api-client';
import { resendVerificationRequestSchema } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { authService } from '@/services/auth.service';

function ResendVerificationForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = resendVerificationRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      await authService.resendVerification(parsed.data);
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
      <p className="text-body">
        If an account exists for <strong className="text-ink">{email}</strong> and it isn&apos;t
        verified yet, a new link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      <p className="text-body">Enter your email and we&apos;ll send a new verification link.</p>
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error}
      />
      <Button type="submit" loading={submitting}>
        Resend verification email
      </Button>
    </form>
  );
}

type CheckState = 'checking' | 'success' | 'failed' | 'idle';

/**
 * Doubles as the token landing page and the "check your inbox" screen: with a `?token=` it verifies
 * immediately, and either way it falls back to a resend form (pre-filled from `?email=` when known,
 * e.g. right after registering).
 */
export function VerifyEmailStatus({
  token,
  initialEmail,
}: {
  token: string | null;
  initialEmail: string;
}) {
  const [state, setState] = useState<CheckState>(token ? 'checking' : 'idle');
  const [failureMessage, setFailureMessage] = useState<string>();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authService
      .verifyEmail({ token })
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('failed');
        setFailureMessage(
          error instanceof ApiClientError ? error.message : 'Something went wrong.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'checking') {
    return <p className="text-body">Verifying your email…</p>;
  }

  if (state === 'success') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body">Your email is verified. You can now sign in.</p>
        <Link
          href={ROUTES.login}
          className="text-sm font-medium text-action hover:text-action-hover"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {state === 'failed' && (
        <FormAlert message={failureMessage ?? 'This link is invalid or has expired.'} />
      )}
      <ResendVerificationForm initialEmail={initialEmail} />
    </div>
  );
}
