import { updateBusinessProfileRequestSchema, type BusinessProfile } from '@platform/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { FormAlert } from '@/components/form-alert';
import { pickPhoto, toLocalFile } from '@/components/photo-picker';
import { AppText, Button, ErrorState, Icon, LoadingView, Screen, TextField, useToast } from '@/components/ui';
import { errorMessage, flattenZodErrors, serverFieldErrors } from '@/lib/errors';
import { mediaUrl } from '@/lib/media';
import { businessService } from '@/services/business.service';
import { uploadsService } from '@/services/uploads.service';
import { colors, radius, space } from '@/theme/tokens';

export default function BusinessProfileScreen() {
  const query = useQuery({
    queryKey: ['business', 'dashboard'],
    queryFn: ({ signal }) => businessService.dashboard(signal).then((r) => r.data),
  });
  return (
    <>
      <Stack.Screen options={{ title: 'Business profile' }} />
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ProfileForm profile={query.data.profile} />
      )}
    </>
  );
}

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState(profile.businessName);
  const [description, setDescription] = useState(profile.description ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [website, setWebsite] = useState(profile.website ?? '');
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeLogo() {
    const asset = await pickPhoto({ allowsEditing: true });
    if (!asset) return;
    setUploading(true);
    try {
      setLogoUrl((await uploadsService.uploadImage(await toLocalFile(asset))).data.url);
    } catch (caught) {
      toast(errorMessage(caught, 'Could not upload the logo.'), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const parsed = updateBusinessProfileRequestSchema.safeParse({
      businessName,
      description: description.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      logoUrl,
    });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await businessService.updateProfile(parsed.data);
      void queryClient.invalidateQueries({ queryKey: ['business'] });
      toast('Business profile saved');
      router.back();
    } catch (caught) {
      const fields = serverFieldErrors(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const logo = mediaUrl(logoUrl);

  return (
    <Screen keyboard footer={<Button title="Save" size="lg" loading={busy} onPress={() => void save()} />}>
      <View style={styles.form}>
        {formError ? <FormAlert message={formError} /> : null}
        <Pressable accessibilityRole="button" onPress={() => void changeLogo()} style={styles.logoWrap}>
          <View style={styles.logo}>
            {uploading ? (
              <ActivityIndicator color={colors.action} />
            ) : logo ? (
              <Image source={{ uri: logo }} style={styles.logoImage} contentFit="cover" />
            ) : (
              <Icon name="storefront" size={34} color={colors.action} />
            )}
          </View>
          <AppText variant="smallStrong" color={colors.action}>
            {logo ? 'Change logo' : 'Add a logo'}
          </AppText>
        </Pressable>
        <TextField label="Business name" icon="storefront-outline" value={businessName} onChangeText={setBusinessName} error={errors.businessName} maxLength={200} />
        <TextField label="About your business" value={description} onChangeText={setDescription} multiline maxLength={2000} error={errors.description} />
        <TextField label="Phone" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
        <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" error={errors.email} />
        <TextField label="Website" icon="globe-outline" placeholder="https://" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" error={errors.website} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  logoWrap: { alignItems: 'center', gap: space.sm },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
});
