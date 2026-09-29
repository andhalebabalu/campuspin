import {
  passwordProblems,
  registerRequestSchema,
  type AccountType,
  type CategorySummary,
} from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { FormAlert } from '@/components/form-alert';
import { AppText, Button, Icon, TextField, type IconName } from '@/components/ui';
import { CategorySheet } from '@/features/places/category-sheet';
import { errorMessage, flattenZodErrors, serverFieldErrors } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { categoriesService } from '@/services/categories.service';
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
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    phone: '',
    city: 'Ahilyanagar',
  });
  const [category, setCategory] = useState<CategorySummary | null>(null);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isBusiness = accountType === 'BUSINESS';
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesService.list(signal).then((r) => r.data),
    enabled: isBusiness,
  });
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
      ...(isBusiness
        ? {
            businessName: values.businessName,
            categoryId: category?.id,
            phone: values.phone || undefined,
            city: values.city || undefined,
          }
        : {}),
    });
    const fields = parsed.success ? {} : flattenZodErrors(parsed.error);
    if (values.password && values.confirmPassword !== values.password) {
      fields.confirmPassword = 'The passwords do not match';
    }
    if (!parsed.success || Object.keys(fields).length > 0) {
      setErrors(fields);
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
        <>
          <TextField
            label="Business name"
            icon="storefront-outline"
            placeholder="Sai Krupa Mess"
            value={values.businessName}
            onChangeText={set('businessName')}
            error={errors.businessName}
          />
          <View style={styles.field}>
            <AppText variant="smallStrong" color={colors.ink}>
              Business category
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickingCategory(true)}
              style={[styles.select, errors.categoryId ? { borderColor: colors.danger } : null]}
            >
              <Icon name="pricetag-outline" size={18} color={colors.muted} />
              <AppText color={category ? colors.ink : colors.placeholder} style={{ flex: 1 }}>
                {category?.name ?? 'Choose a category'}
              </AppText>
              <Icon name="chevron-down" size={18} color={colors.muted} />
            </Pressable>
            {errors.categoryId ? (
              <AppText variant="small" color={colors.danger}>
                {errors.categoryId}
              </AppText>
            ) : null}
          </View>
          <TextField
            label="Phone"
            icon="call-outline"
            placeholder="+91 98765 43210"
            value={values.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={errors.phone}
          />
          <TextField
            label="City"
            icon="location-outline"
            value={values.city}
            onChangeText={set('city')}
            error={errors.city}
          />
        </>
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
      <TextField
        label="Confirm password"
        icon="lock-closed-outline"
        value={values.confirmPassword}
        onChangeText={set('confirmPassword')}
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.confirmPassword}
      />

      <Button
        title={isBusiness ? 'Create business account' : 'Create student account'}
        size="lg"
        loading={submitting}
        onPress={() => void submit()}
      />
      <AppText variant="caption" align="center">
        We’ll email you a link to confirm your address.
        {isBusiness ? ' Our team reviews every new business before its page goes live.' : ''}
      </AppText>
      <CategorySheet
        visible={pickingCategory}
        groups={categories.data ?? []}
        loading={categories.isPending}
        selectedId={category?.id ?? null}
        onClose={() => setPickingCategory(false)}
        onPick={(picked) => {
          setCategory(picked);
          setPickingCategory(false);
        }}
      />
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
  field: { gap: space.xs + 2 },
  select: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rules: { gap: 4, marginTop: -space.sm },
  rule: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
