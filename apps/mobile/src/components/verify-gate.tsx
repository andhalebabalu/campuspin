import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Icon, type IconName } from '@/components/ui';
import { brandGradient, colors, radius, shadows, space } from '@/theme/tokens';

/**
 * Shown instead of the community and marketplace until the student has verified their college:
 * both are only for verified students.
 */
export function VerifyGate({
  icon,
  title,
  message,
}: {
  icon: IconName;
  title: string;
  message: string;
}) {
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.icon}>
          <Icon name={icon} size={28} color={colors.surface} />
        </View>
        <AppText variant="title" color={colors.surface}>
          {title}
        </AppText>
        <AppText color="rgba(255,255,255,0.82)">{message}</AppText>
        <View style={styles.steps}>
          {[
            'Pick your college',
            'Confirm with your college email or ID card',
            'Join your college’s chats and marketplace',
          ].map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepNumber}>
                <AppText variant="caption" color={colors.action}>
                  {index + 1}
                </AppText>
              </View>
              <AppText variant="small" color={colors.surface} style={styles.flex}>
                {step}
              </AppText>
            </View>
          ))}
        </View>
        <Button
          title="Verify my college"
          variant="light"
          icon="shield-checkmark"
          onPress={() => router.push('/verification')}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg },
  card: { borderRadius: radius.xl, padding: space.xl, gap: space.md, ...shadows.md },
  icon: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: { gap: space.sm, marginVertical: space.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
