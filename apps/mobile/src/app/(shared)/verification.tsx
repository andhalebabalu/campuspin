import type { StudentStatus } from '@platform/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CollegePicker, type PickedCollege } from '@/components/college-picker';
import { FormAlert } from '@/components/form-alert';
import { pickPhoto, toLocalFile } from '@/components/photo-picker';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  Icon,
  LoadingView,
  Screen,
  Segmented,
  TextField,
  useToast,
} from '@/components/ui';
import { errorMessage, serverFieldErrors } from '@/lib/errors';
import type { LocalFile } from '@/lib/files';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { studentsService } from '@/services/students.service';
import { brandGradient, colors, radius, space } from '@/theme/tokens';

/**
 * The student verification journey: pick the college, then a code sent to the college email or an
 * ID photo for staff. Shows where the member stands and what to do next.
 */
export default function Verification() {
  const { refreshUser } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['student-status'],
    queryFn: ({ signal }) => studentsService.status(signal).then((r) => r.data),
  });

  async function update(next: StudentStatus) {
    queryClient.setQueryData(['student-status'], next);
    if (next.state === 'VERIFIED') {
      await refreshUser();
      void queryClient.invalidateQueries();
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Student verification' }} />
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Screen keyboard refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
          <View style={styles.stack}>
            <StatusCard status={query.data} />
            {query.data.state === 'VERIFIED' ? (
              <Card style={styles.stack}>
                <AppText variant="subheading">You’re all set</AppText>
                <Button title="Open your college chats" icon="chatbubbles" onPress={() => router.navigate('/community')} />
                <Button title="Browse the marketplace" variant="secondary" icon="pricetags" onPress={() => router.navigate('/market')} />
              </Card>
            ) : query.data.pending?.method === 'COLLEGE_EMAIL' ? (
              <CodeStep status={query.data} onDone={update} />
            ) : query.data.pending?.method === 'DOCUMENT' ? (
              <WaitingCard status={query.data} onChange={update} />
            ) : (
              <StartVerification onStarted={update} />
            )}
            <View style={styles.privacy}>
              <Icon name="lock-closed" size={16} color={colors.muted} />
              <AppText variant="small" style={styles.flex}>
                Your ID photo is private: only our verification staff can see it, and it is deleted
                right after they decide. Your college email is never shown to anyone.
              </AppText>
            </View>
          </View>
        </Screen>
      )}
    </>
  );
}

function StatusCard({ status }: { status: StudentStatus }) {
  const lines: Record<StudentStatus['state'], { title: string; text: string; icon: 'shield-checkmark' | 'hourglass' | 'alert-circle' | 'school' }> = {
    VERIFIED: {
      title: 'You are a Verified Student',
      text: status.badge.verifiedUntil ? `Valid until ${formatDate(status.badge.verifiedUntil)}.` : 'Your college community and marketplace are open to you.',
      icon: 'shield-checkmark',
    },
    PENDING: {
      title: 'Verification in progress',
      text:
        status.pending?.method === 'DOCUMENT'
          ? 'Staff are checking your student ID. This usually takes a day or two.'
          : 'Enter the code we emailed to your college address.',
      icon: 'hourglass',
    },
    EXPIRED: {
      title: 'Your verification has lapsed',
      text: 'Verify again to keep using your college community and the marketplace.',
      icon: 'alert-circle',
    },
    UNVERIFIED: {
      title: 'Verify that you’re a student',
      text: 'Verified students get their college’s group chats and the student marketplace.',
      icon: 'school',
    },
  };
  const line = lines[status.state];
  return (
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.status}>
      <View style={styles.statusIcon}>
        <Icon name={line.icon} size={26} color={colors.surface} />
      </View>
      <AppText variant="heading" color={colors.surface}>
        {line.title}
      </AppText>
      <AppText color="rgba(255,255,255,0.85)">{line.text}</AppText>
      {status.badge.college ? (
        <View style={styles.collegePill}>
          <Icon name="school" size={14} color={colors.surface} />
          <AppText variant="smallStrong" color={colors.surface}>
            {status.badge.college.name}
          </AppText>
        </View>
      ) : null}
      {status.lastDecision && status.state !== 'VERIFIED' && status.lastDecision.reviewNote ? (
        <View style={styles.note}>
          <AppText variant="smallStrong" color={colors.ink}>
            {status.lastDecision.status === 'REJECTED' ? 'Your last request was not approved' : 'Staff asked you to verify again'}
          </AppText>
          <AppText variant="small" color={colors.ink}>
            {status.lastDecision.reviewNote}
          </AppText>
        </View>
      ) : null}
    </LinearGradient>
  );
}

type Method = 'email' | 'document';

function StartVerification({ onStarted }: { onStarted: (status: StudentStatus) => Promise<void> }) {
  const [method, setMethod] = useState<Method>('email');
  const [college, setCollege] = useState<PickedCollege | null>(null);
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<LocalFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choosePhoto() {
    const asset = await pickPhoto();
    if (asset) setFile(await toLocalFile(asset));
  }

  async function submit() {
    setFormError(null);
    if (!college) return setErrors({ collegeId: 'Choose your college first' });
    if (method === 'email' && !email.trim()) return setErrors({ email: 'Enter your college email' });
    if (method === 'document' && !file) return setErrors({ file: 'Add a photo of your student ID' });
    setErrors({});
    setBusy(true);
    try {
      const result =
        method === 'email'
          ? await studentsService.requestEmail({ collegeId: college.id, email: email.trim() })
          : await studentsService.submitDocument(college.id, file!);
      await onStarted(result.data);
    } catch (caught) {
      const fields = serverFieldErrors(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.stack}>
      <AppText variant="subheading">Get verified</AppText>
      {formError ? <FormAlert message={formError} /> : null}
      <CollegePicker value={college} onPick={setCollege} error={errors.collegeId} />
      <Segmented
        options={[
          { value: 'email', label: 'College email' },
          { value: 'document', label: 'Student ID photo' },
        ]}
        value={method}
        onChange={setMethod}
      />
      {method === 'email' ? (
        <TextField
          label="College email address"
          icon="mail-outline"
          placeholder="you@yourcollege.edu.in"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          hint="Only your college’s official email domain works. We’ll send a 6-digit code."
          error={errors.email}
        />
      ) : (
        <View style={styles.stack}>
          <Pressable onPress={() => void choosePhoto()} style={[styles.upload, errors.file ? { borderColor: colors.danger } : null]}>
            {file ? (
              <Image source={{ uri: file.uri }} style={styles.idPreview} contentFit="cover" />
            ) : (
              <>
                <Icon name="id-card-outline" size={32} color={colors.action} />
                <AppText variant="bodyStrong" color={colors.action}>
                  Add a photo of your ID card
                </AppText>
              </>
            )}
          </Pressable>
          <AppText variant="small" color={errors.file ? colors.danger : colors.muted}>
            {errors.file ??
              'You may cover your ID number and date of birth: we only need your name, the college and the current year.'}
          </AppText>
        </View>
      )}
      <Button
        title={method === 'email' ? 'Send code' : 'Submit for review'}
        icon={method === 'email' ? 'send' : 'cloud-upload-outline'}
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

function CodeStep({ status, onDone }: { status: StudentStatus; onDone: (status: StudentStatus) => Promise<void> }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setError(undefined);
    setBusy(true);
    try {
      await onDone((await studentsService.confirmEmail({ code: code.trim() })).data);
      toast('You’re verified! 🎉');
    } catch (caught) {
      setError(serverFieldErrors(caught).code ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    try {
      await onDone((await studentsService.cancel()).data);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Card style={styles.stack}>
      <AppText variant="subheading">Enter your code</AppText>
      <AppText variant="small">
        We sent a 6-digit code to <AppText variant="smallStrong">{status.pending?.collegeEmail}</AppText> for{' '}
        {status.pending?.college.name}. It expires in 15 minutes.
      </AppText>
      <TextField
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
        placeholder="••••••"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        style={styles.code}
        error={error}
      />
      <Button title="Verify" loading={busy} disabled={code.length !== 6} onPress={() => void confirm()} />
      <Button title="Use a different email or method" variant="ghost" onPress={() => void startOver()} />
    </Card>
  );
}

function WaitingCard({ status, onChange }: { status: StudentStatus; onChange: (status: StudentStatus) => Promise<void> }) {
  const toast = useToast();
  return (
    <Card style={styles.stack}>
      <AppText variant="subheading">Waiting for review</AppText>
      <AppText variant="small">
        Your student ID for <AppText variant="smallStrong">{status.pending?.college.name}</AppText> was sent on{' '}
        {status.pending ? formatDate(status.pending.createdAt) : ''}. We’ll notify you when staff decide; the photo is
        deleted right after.
      </AppText>
      <Button
        title="Cancel and start over"
        variant="outline"
        onPress={() => {
          studentsService
            .cancel()
            .then((result) => onChange(result.data))
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flex: { flex: 1 },
  status: { borderRadius: radius.xl, padding: space.xl, gap: space.sm },
  statusIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collegePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  note: { marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, gap: 2 },
  upload: {
    height: 170,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
  idPreview: { width: '100%', height: '100%' },
  code: { fontSize: 26, letterSpacing: 10, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  privacy: { flexDirection: 'row', gap: space.sm, padding: space.md },
});
