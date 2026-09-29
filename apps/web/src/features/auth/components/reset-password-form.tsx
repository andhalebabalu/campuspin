'use client';

import { ApiClientError } from '@platform/api-client';
import { resetPasswordRequestSchema } from '@platform/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { firstFieldErrors } from '@/lib/forms/errors';
import { authService } from '@/services/auth.service';

interface Values {
  newPassword: string;
  confirmPassword: string;
}

const INITIAL: Values = { newPassword: '', confirmPassword: '' };

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <FormAlert message="This link is missing its reset token.">
        <Link href={ROUTES.forgotPassword} className="font-medium underline">
          Request a new link
        </Link>
      </FormAlert>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (values.newPassword !== values.confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    const parsed = resetPasswordRequestSchema.safeParse({
      token,
      newPassword: values.newPassword,
    });
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'newPassword' ? 'newPassword' : '_root';
        if (!(key in fields)) fields[key] = issue.message;
      }
      setErrors(fields);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await authService.resetPassword(parsed.data);
      setDone(true);
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

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body">
          Your password has been reset. Please sign in with your new password.
        </p>
        <Link
          href={ROUTES.signIn}
          className="text-sm font-medium text-action hover:text-action-hover"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
      {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters mixing letters, numbers or symbols (or a 16+ character passphrase)."
        value={values.newPassword}
        onChange={(event) => setValues((v) => ({ ...v, newPassword: event.target.value }))}
        error={errors.newPassword}
      />
      <Input
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(event) => setValues((v) => ({ ...v, confirmPassword: event.target.value }))}
        error={errors.confirmPassword}
      />
      <Button type="submit" loading={submitting} fullWidth>
        Reset password
      </Button>
    </form>
  );
}
