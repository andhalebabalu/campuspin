import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Icon, type IconName } from '@/components/ui';
import { useLightStatusBar } from '@/hooks/use-status-bar';
import { colors, heroGradient, radius, space } from '@/theme/tokens';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'chatbubbles',
    title: 'Your college community',
    text: 'Group chats, events, notes and jobs with verified students only.',
  },
  {
    icon: 'pricetags',
    title: 'Student marketplace',
    text: 'Buy and sell books, cycles and hostel gear with students nearby.',
  },
  {
    icon: 'location',
    title: 'Places around campus',
    text: 'Messes, PGs and cafés, rated by students who actually go there.',
  },
];

export default function Welcome() {
  useLightStatusBar();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.root}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <View style={[styles.top, { paddingTop: insets.top + space.xxxl }]}>
        <View style={styles.mark}>
          <Image source={require('@/assets/images/brand-mark.png')} style={styles.markImage} />
        </View>
        <AppText variant="hero" color={colors.surface} style={styles.headline}>
          Everything around{'\n'}your campus.
        </AppText>
        <AppText color="rgba(255,255,255,0.78)" style={styles.lead}>
          One app for students and the businesses that serve them.
        </AppText>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Icon name={feature.icon} size={20} color={colors.surface} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" color={colors.surface}>
                  {feature.title}
                </AppText>
                <AppText variant="small" color="rgba(255,255,255,0.72)">
                  {feature.text}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.xl }]}>
        <Button
          title="Create an account"
          variant="light"
          size="lg"
          iconRight="arrow-forward"
          onPress={() => router.push('/register')}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/login')}
          style={({ pressed }) => [styles.signIn, pressed && { opacity: 0.8 }]}
        >
          <AppText variant="bodyStrong" color={colors.surface}>
            I already have an account
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/register', params: { type: 'BUSINESS' } })}
          style={styles.business}
        >
          <Icon name="storefront-outline" size={16} color="rgba(255,255,255,0.8)" />
          <AppText variant="small" color="rgba(255,255,255,0.8)">
            Own a mess, PG or shop? <AppText variant="smallStrong" color={colors.surface}>List your business</AppText>
          </AppText>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  glowOne: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(80,155,246,0.3)',
    top: -120,
    right: -140,
  },
  glowTwo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(44,150,60,0.22)',
    bottom: 120,
    left: -130,
  },
  top: { flex: 1, paddingHorizontal: space.xxl },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: { width: 46, height: 46 },
  headline: { marginTop: space.xxl, fontSize: 34, lineHeight: 40 },
  lead: { marginTop: space.md, fontSize: 16 },
  features: { marginTop: space.xxxl, gap: space.lg },
  feature: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { paddingHorizontal: space.xxl, gap: space.sm },
  signIn: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  business: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: space.md,
  },
});
