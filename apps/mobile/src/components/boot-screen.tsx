import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/**
 * What shows while fonts load and the session is restored: the same logo, size and place as the
 * native splash screen, so the hand-over is invisible. No custom fonts here: they may not be
 * loaded yet.
 */
export function BootScreen() {
  return (
    <View style={styles.root} accessibilityLabel="CampusPin is loading">
      <Image source={require('@/assets/images/splash-icon.png')} style={styles.logo} contentFit="contain" />
      <ActivityIndicator color="#123d73" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 200, height: 200 },
  spinner: { position: 'absolute', bottom: 96 },
});
