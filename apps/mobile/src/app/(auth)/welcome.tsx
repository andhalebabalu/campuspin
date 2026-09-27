import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Icon, type IconName } from '@/components/ui';
import { colors, radius, shadows, space } from '@/theme/tokens';

const FEATURES: { icon: IconName; title: string; text: string; tint: readonly [string, string] }[] = [
  {
    icon: 'location',
    title: 'Discover',
    text: 'Messes, PGs, libraries and cafés around campus, rated by students.',
    tint: [colors.pinSoft, colors.pin],
  },
  {
    icon: 'chatbubbles',
    title: 'Connect',
    text: 'Your college’s group chats, events, notes and jobs, for verified students only.',
    tint: [colors.actionSoft, colors.brand],
  },
  {
    icon: 'pricetags',
    title: 'Experience',
    text: 'Buy and sell books, cycles and hostel gear with students nearby.',
    tint: [colors.accentSoft, colors.accentBright],
  },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {/* Soft brand-coloured shapes behind the content. */}
      <View style={[styles.blob, styles.blobNavy]} />
      <View style={[styles.blob, styles.blobGreen]} />
      <View style={[styles.blob, styles.blobPin]} />

      <View style={[styles.top, { paddingTop: insets.top + space.xxxl + space.lg }]}>
        <Image
          source={require('@/assets/images/logo-full.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="CampusPin: Discover. Connect. Experience."
        />

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: feature.tint[0] }]}>
                <Icon name={feature.icon} size={22} color={feature.tint[1]} />
              </View>
              <View style={styles.flex}>
                <AppText variant="subheading">{feature.title}</AppText>
                <AppText variant="small">{feature.text}</AppText>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.xl }]}>
        <Button
          title="Create an account"
          size="lg"
          iconRight="arrow-forward"
          onPress={() => router.push('/register')}
        />
        <Button
          title="I already have an account"
          variant="outline"
          size="lg"
          onPress={() => router.push('/login')}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/register', params: { type: 'BUSINESS' } })}
          style={styles.business}
        >
          <Icon name="storefront-outline" size={16} color={colors.accent} />
          <AppText variant="small">
            Own a mess, PG or shop?{' '}
            <AppText variant="smallStrong" color={colors.accent}>
              List your business
            </AppText>
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  flex: { flex: 1 },
  blob: { position: 'absolute', borderRadius: 999 },
  blobNavy: { width: 320, height: 320, top: -150, right: -110, backgroundColor: 'rgba(7,48,102,0.07)' },
  blobGreen: { width: 240, height: 240, top: 250, left: -150, backgroundColor: 'rgba(42,145,60,0.08)' },
  blobPin: { width: 160, height: 160, bottom: 190, right: -70, backgroundColor: 'rgba(234,61,36,0.07)' },
  top: { flex: 1, paddingHorizontal: space.xxl },
  logo: { width: '100%', aspectRatio: 1410 / 388 },
  features: { marginTop: space.xxxl + space.md, gap: space.md },
  feature: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { paddingHorizontal: space.xxl, gap: space.sm },
  business: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: space.md,
  },
});
