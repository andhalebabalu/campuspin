import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { env } from '@/lib/env';
import { space } from '@/theme/tokens';

export default function About() {
  return (
    <>
      <Stack.Screen options={{ title: 'About' }} />
      <Screen>
        <View style={styles.stack}>
          <View style={styles.brand}>
            <Image
              source={require('@/assets/images/logo-full.png')}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel="CampusPin: Discover. Connect. Experience."
            />
            <AppText variant="small">Version {Constants.expoConfig?.version ?? '1.0.0'}</AppText>
          </View>
          <Card style={styles.stack}>
            <AppText>
              CampusPin brings students and the places around their campus together: verified college
              communities, a student marketplace, and messes, PGs, libraries and more, rated by
              students.
            </AppText>
            <AppText variant="small">
              Be kind, meet in public places when you buy or sell, and report anything that breaks the
              rules. Our team reviews every report.
            </AppText>
          </Card>
          {__DEV__ ? (
            <Card style={styles.stack}>
              <AppText variant="caption">DEVELOPER</AppText>
              <AppText variant="small" selectable>
                API: {env.API_URL}
              </AppText>
            </Card>
          ) : null}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  brand: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  logo: { width: '85%', aspectRatio: 1410 / 388, marginBottom: space.sm },
});
