import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AppText, Button, Screen } from '@/components/ui';
import { SITE_URL } from '@/lib/env';
import { colors, radius, shadows, space } from '@/theme/tokens';

/**
 * A listing's review QR code. Students scan it at the place with their normal camera and land on
 * the website's review form. The link uses the listing id, which never changes.
 */
export default function ReviewQr() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const link = `${SITE_URL}/places/${encodeURIComponent(id)}/review`;
  const placeName = name ?? 'your place';

  return (
    <>
      <Stack.Screen options={{ title: 'Review QR code' }} />
      <Screen>
        <View style={styles.stack}>
          <View style={styles.poster}>
            <Image
              source={require('@/assets/images/logo-wordmark.png')}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel="CampusPin"
            />
            <AppText variant="title" align="center">
              Rate {placeName}
            </AppText>
            <View style={styles.qr}>
              <QRCode value={link} size={220} color={colors.ink} backgroundColor={colors.surface} ecl="M" />
            </View>
            <AppText align="center">Point your phone camera at the code and tell other students how it was.</AppText>
          </View>
          <AppText variant="small" align="center">
            Print it and put it on your counter or table. Only verified students can post a review.
          </AppText>
          <Button
            title="Share link"
            icon="share-social-outline"
            onPress={() => void Share.share({ message: `Review ${placeName} on CampusPin: ${link}` })}
          />
          <AppText variant="caption" align="center" selectable>
            {link}
          </AppText>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  poster: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  logo: { width: 180, height: 180 * (301 / 1410) },
  qr: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
});
