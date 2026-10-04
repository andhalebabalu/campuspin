import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import type { Profile } from '@platform/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AvatarEditor } from '@/components/avatar-editor';
import { CollegePicker, type PickedCollege } from '@/components/college-picker';
import { FormAlert } from '@/components/form-alert';
import {
  AppText,
  Button,
  Chip,
  ErrorState,
  LoadingView,
  Screen,
  TextField,
  useToast,
} from '@/components/ui';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { studentsService } from '@/services/students.service';
import { colors, radius, space } from '@/theme/tokens';

const YEARS = [1, 2, 3, 4, 5, 6];

export default function EditProfile() {
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => studentsService.profile(signal).then((r) => r.data),
  });
  return (
    <>
      <Stack.Screen options={{ title: 'Edit profile' }} />
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ProfileForm profile={query.data} />
      )}
    </>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { refreshUser } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [college, setCollege] = useState<PickedCollege | null>(profile.college);
  const [course, setCourse] = useState(profile.course ?? '');
  const [year, setYear] = useState<number | null>(profile.year);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await studentsService.updateProfile({
        name: name.trim(),
        // A verified student's college comes from their verification and is not changed here.
        ...(profile.student.verified ? {} : { collegeId: college?.id ?? null }),
        course: course.trim() || null,
        year,
      });
      queryClient.setQueryData(['profile'], result.data);
      await refreshUser();
      toast('Profile saved');
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
    <Screen
      keyboard
      footer={<Button title="Save" size="lg" loading={busy} onPress={() => void save()} />}
    >
      <View style={styles.form}>
        <View style={styles.photo}>
          <AvatarEditor size={104} />
          <AppText variant="small">Tap your photo to change it</AppText>
        </View>
        {formError ? <FormAlert message={formError} /> : null}
        <TextField
          label="Name"
          icon="person-outline"
          value={name}
          onChangeText={setName}
          error={errors.name}
          maxLength={120}
        />
        {profile.student.verified ? (
          <View style={styles.locked}>
            <AppText variant="smallStrong" color={colors.ink}>
              College
            </AppText>
            <AppText>{profile.student.college?.name}</AppText>
            <AppText variant="caption">Set by your student verification.</AppText>
          </View>
        ) : (
          <CollegePicker value={college} onPick={setCollege} error={errors.collegeId} />
        )}
        <TextField
          label="Course (optional)"
          icon="book-outline"
          placeholder="e.g. B.Sc. Computer Science"
          value={course}
          onChangeText={setCourse}
          error={errors.course}
          maxLength={120}
        />
        <View style={styles.years}>
          <AppText variant="smallStrong" color={colors.ink}>
            Year (optional)
          </AppText>
          <View style={styles.chips}>
            {YEARS.map((value) => (
              <Chip
                key={value}
                label={`Year ${value}`}
                selected={year === value}
                onPress={() => setYear(year === value ? null : value)}
              />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  photo: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  locked: { gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.subtle },
  years: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
