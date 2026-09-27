import { createLeadRequestSchema } from '@platform/contracts';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FormAlert } from '@/components/form-alert';
import { AppText, Button, Icon, Screen, TextField, useToast } from '@/components/ui';
import { errorMessage, flattenZodErrors, serverFieldErrors } from '@/lib/errors';
import { useUser } from '@/lib/session';
import { enquiriesService } from '@/services/enquiries.service';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Ask a place a question. The business gets the student's name, email and (optional) phone, which
 * is why sharing them needs explicit consent.
 */
export default function Enquire() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const user = useUser();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const placeName = name ?? 'this place';

  async function submit() {
    const parsed = createLeadRequestSchema.safeParse({
      message,
      ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
      consent,
    });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await enquiriesService.send(slug, parsed.data);
      toast(`Sent! ${placeName} will reply by email or phone.`);
      router.back();
    } catch (caught) {
      const fields = serverFieldErrors(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Send an enquiry' }} />
      <Screen keyboard footer={<Button title="Send enquiry" icon="send" size="lg" loading={busy} onPress={() => void submit()} />}>
        <View style={styles.form}>
          <AppText variant="title">{placeName}</AppText>
          <AppText variant="small">Ask about availability, prices, timings… The owner replies to you directly.</AppText>
          {formError ? <FormAlert message={formError} /> : null}
          <TextField
            label="Your message"
            placeholder="Is a double-sharing room available from July? What is the deposit?"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
            error={errors.message}
          />
          <TextField
            label="Phone (optional)"
            placeholder="+91 98xxxxxxxx"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            icon="call-outline"
            error={errors.contactPhone}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent((value) => !value)}
            style={styles.consent}
          >
            <View style={[styles.box, consent && styles.boxOn]}>
              {consent ? <Icon name="checkmark" size={16} color={colors.surface} /> : null}
            </View>
            <AppText variant="small" color={colors.ink} style={styles.flex}>
              Share my name ({user.name}), email{phone.trim() ? ' and phone' : ''} with {placeName} so they can reply.
            </AppText>
          </Pressable>
          {errors.consent ? (
            <AppText variant="small" color={colors.danger}>
              {errors.consent}
            </AppText>
          ) : null}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  flex: { flex: 1 },
  consent: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.action, borderColor: colors.action },
});
