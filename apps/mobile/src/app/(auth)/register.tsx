import { passwordProblems, registerRequestSchema, type AccountType } from '@platform/contracts';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { FormAlert } from '@/components/form-alert';
import { AppText, Button, Icon, TextField, type IconName } from '@/components/ui';
import { errorMessage, flattenZodErrors, serverFieldErrors } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme/tokens';

const CHOICES: { type: AccountType; icon: IconName; title: string; text: string }[] = [
  { type: 'STUDENT', icon: 'school', title: 'Student', text: 'Community, marketplace, places' },
  { type: 'BUSINESS', icon: 'storefront', title: 'Business', text: 'List your place, get enquiries' },
];

export default function Register() {
  const params = useLocalSearchParams<{ type?: string }>();
  const { register } = useSession();
  const [accountType, setAccountType] = useState<AccountType>(
    params.type === 'BUSINESS' ? 'BUSINESS' : 'STUDENT',
  );
  const [values, setValues] = useState({ name: '', email: '', password: '', businessName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isBusiness = accountType === 'BUSINESS';
  const problems = values.password ? passwordProblems(values.password) : [];

  const set = (key: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [key]: text }));

  async function submit() {
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
      router.replace({ pathname: '/check-email', params: { email: parsed.data.email } });
    } catch (error) {
      const fields = serverFieldErrors(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <AppText variant="small">
          Already have an account?{' '}
          <Link href="/login" replace>
            <AppText variant="smallStrong" color={colors.action}>
              Sign in
            </AppText>
          </Link>
        </AppText>
      }
    >
      <View style={styles.choices}>
        {CHOICES.map((choice) => {
          const selected = choice.type === accountType;
          return (
            <Pressable
              key={choice.type}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                setAccountType(choice.type);
                setErrors({});
              }}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <View style={[styles.choiceIcon, selected && { backgroundColor: colors.action }]}>
                <Icon name={choice.icon} size={20} color={selected ? colors.surface : colors.action} />
              </View>
              <AppText variant="bodyStrong">{choice.title}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {choice.text}
              </AppText>
              {selected ? (
                <View style={styles.check}>
                  <Icon name="checkmark-circle" size={20} color={colors.action} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {formError ? <FormAlert message={formError} /> : null}

      <TextField
        label="Your name"
        icon="person-outline"
        placeholder="Asha Patil"
        value={values.name}
        onChangeText={set('name')}
        autoComplete="name"
        textContentType="name"
        error={errors.name}
      />
      {isBusiness ? (
        <TextField
          label="Business name"
          icon="storefront-outline"
          placeholder="Sai Krupa Mess"
          value={values.businessName}
          onChangeText={set('businessName')}
          error={errors.businessName}
        />
      ) : null}
      <TextField
        label="Email"
        icon="mail-outline"
        placeholder="you@example.com"
        value={values.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={errors.email}
      />
      <TextField
        label="Password"
        icon="lock-closed-outline"
        placeholder="At least 10 characters"
        value={values.password}
        onChangeText={set('password')}
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
      />
      {values.password && !errors.password ? (
        <View style={styles.rules}>
          {problems.length === 0 ? (
            <Rule ok text="Strong password" />
          ) : (
            problems.map((problem) => <Rule key={problem} text={problem} />)
          )}
        </View>
      ) : null}

      <Button
        title={isBusiness ? 'Create business account' : 'Create student account'}
        size="lg"
        loading={submitting}
        onPress={() => void submit()}
      />
      <AppText variant="caption" align="center">
        We’ll email you a link to confirm your address.
      </AppText>
    </AuthShell>
  );
}

function Rule({ text, ok = false }: { text: string; ok?: boolean }) {
  return (
    <View style={styles.rule}>
      <Icon
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={15}
        color={ok ? colors.success : colors.muted}
      />
      <AppText variant="small" color={ok ? colors.success : colors.body} style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', gap: space.md },
  choice: {
    flex: 1,
    padding: space.md,
    gap: 4,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  choiceSelected: { borderColor: colors.action, backgroundColor: colors.actionSoft },
  choiceIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  check: { position: 'absolute', top: space.sm, right: space.sm },
  rules: { gap: 4, marginTop: -space.sm },
  rule: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
