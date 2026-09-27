import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { AppText, Button, Icon, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { authService } from '@/services/auth.service';
import { colors, space } from '@/theme/tokens';

/**
 * After sign-up. The confirmation link in the email opens in the browser; once confirmed, the
 * member signs in here.
 */
export default function CheckEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  async function resend() {
    if (!email) return;
    setSending(true);
    try {
      await authService.resendVerification({ email });
      toast('Sent again. Check your inbox and spam folder.');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell title="Check your email" subtitle="One last step to activate your account.">
      <View style={styles.icon}>
        <Icon name="mail-unread" size={34} color={colors.action} />
      </View>
      <AppText align="center">
        We sent a confirmation link to{' '}
        <AppText variant="bodyStrong">{email ?? 'your email address'}</AppText>. Open it on this
        phone or any device, then come back and sign in.
      </AppText>
      <Button title="I’ve confirmed, sign in" size="lg" onPress={() => router.replace('/login')} />
      {email ? (
        <Button
          title="Resend the email"
          variant="ghost"
          loading={sending}
          onPress={() => void resend()}
        />
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  icon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -space.xs,
  },
});
