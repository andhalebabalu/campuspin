import { ApiClientError } from '@platform/api-client';
import { loginRequestSchema } from '@platform/contracts';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, type TextInput } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { FormAlert } from '@/components/form-alert';
import { AppText, Button, TextField, useToast } from '@/components/ui';
import { errorMessage, flattenZodErrors, serverFieldErrors } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { authService } from '@/services/auth.service';
import { colors } from '@/theme/tokens';

export default function Login() {
  const { login } = useSession();
  const toast = useToast();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit() {
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setUnverifiedEmail(null);
    setSubmitting(true);
    try {
      await login(parsed.data);
      // The root guards now switch to the right app; the index route picks the first tab.
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(parsed.data.email);
      }
      const fields = serverFieldErrors(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await authService.resendVerification({ email: unverifiedEmail });
      toast('Verification email sent. Check your inbox.');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your CampusPin account."
      footer={
        <AppText variant="small">
          New here?{' '}
          <Link href="/register" replace>
            <AppText variant="smallStrong" color={colors.action}>
              Create an account
            </AppText>
          </Link>
        </AppText>
      }
    >
      {formError ? (
        <FormAlert message={formError}>
          {unverifiedEmail ? (
            <Button
              title="Resend verification email"
              variant="secondary"
              size="sm"
              loading={resending}
              onPress={() => void resend()}
            />
          ) : null}
        </FormAlert>
      ) : null}
      <TextField
        label="Email"
        icon="mail-outline"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errors.email}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        icon="lock-closed-outline"
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        secureToggle
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        error={errors.password}
      />
      <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
        <AppText variant="smallStrong" color={colors.action}>
          Forgot password?
        </AppText>
      </Pressable>
      <Button title="Sign in" size="lg" loading={submitting} onPress={() => void submit()} />
    </AuthShell>
  );
}
