import { forgotPasswordRequestSchema } from '@platform/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { FormAlert } from '@/components/form-alert';
import { Button, TextField } from '@/components/ui';
import { errorMessage, flattenZodErrors } from '@/lib/errors';
import { authService } from '@/services/auth.service';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(flattenZodErrors(parsed.error).email);
      return;
    }
    setError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      await authService.forgotPassword(parsed.data);
      setSent(true);
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a link to choose a new one.">
      {sent ? (
        <>
          <FormAlert
            tone="success"
            message="If an account exists for that email, a reset link is on its way. Open it, choose a new password, then sign in here."
          />
          <Button title="Back to sign in" size="lg" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          {formError ? <FormAlert message={formError} /> : null}
          <TextField
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
            error={error}
          />
          <Button title="Send reset link" size="lg" loading={submitting} onPress={() => void submit()} />
        </>
      )}
    </AuthShell>
  );
}
