import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, LoadingView } from '@/components/ui';
import { tokenFromScan } from '@/features/orders/qr';
import { colors, radius, space } from '@/theme/tokens';

/** Point the camera at a CampusPin QR code on a table or counter. */
export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) return <LoadingView />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Scan a CampusPin code' }} />
        <EmptyState
          icon="camera-outline"
          title="Allow the camera"
          message="CampusPin needs the camera only to read QR codes at restaurants and shops."
          actionLabel={permission.canAskAgain ? 'Allow camera' : undefined}
          onAction={permission.canAskAgain ? () => void requestPermission() : undefined}
        />
        {!permission.canAskAgain ? (
          <AppText align="center" variant="small">
            Turn on the camera for CampusPin in your phone’s settings.
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Scan a CampusPin code', headerTransparent: true, headerTintColor: colors.surface }} />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          const token = tokenFromScan(data);
          if (!token) {
            setProblem('That is not a CampusPin code. Look for the CampusPin logo on the card.');
            return;
          }
          handled.current = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          router.replace({ pathname: '/use/[token]', params: { token } });
        }}
      />
      <View style={styles.frame} pointerEvents="none" />
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <AppText variant="bodyStrong" color={colors.surface} align="center">
          {problem ?? 'Point at the QR code on your table or the counter'}
        </AppText>
        {problem ? <Button title="Try again" variant="light" size="sm" onPress={() => setProblem(null)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: colors.canvas },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '28%',
    width: 250,
    height: 250,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.md,
    padding: space.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
