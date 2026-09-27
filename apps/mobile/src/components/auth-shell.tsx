import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BackButton } from '@/components/ui';
import { useLightStatusBar } from '@/hooks/use-status-bar';
import { colors, heroGradient, radius, shadows, space } from '@/theme/tokens';

/** The shared frame of the sign-in screens: a brand gradient on top, a white form card below. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useLightStatusBar();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + space.sm }]}
        >
          <View style={styles.glowOne} />
          <View style={styles.glowTwo} />
          <BackButton tone="glass" />
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Image source={require('@/assets/images/brand-mark.png')} style={styles.markImage} />
            </View>
            <AppText variant="heading" color={colors.surface}>
              CampusPin
            </AppText>
          </View>
          <AppText variant="hero" color={colors.surface} style={styles.title}>
            {title}
          </AppText>
          <AppText color="rgba(255,255,255,0.8)">{subtitle}</AppText>
        </LinearGradient>

        <View style={styles.card}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  hero: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl + space.xxl,
    overflow: 'hidden',
    gap: space.sm,
  },
  glowOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(80,155,246,0.35)',
    top: -90,
    right: -80,
  },
  glowTwo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(44,150,60,0.25)',
    bottom: -70,
    left: -50,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: { width: 26, height: 26 },
  title: { marginTop: space.lg },
  card: {
    marginTop: -space.xxxl,
    marginHorizontal: space.lg,
    padding: space.xl,
    gap: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.lg,
  },
  footer: { alignItems: 'center', marginTop: space.xl, paddingHorizontal: space.lg, gap: space.sm },
});
