import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BootScreen } from '@/components/boot-screen';
import { ToastProvider } from '@/components/ui';
import { useVisitTracker } from '@/hooks/use-visit-tracker';
import { queryClient } from '@/lib/query';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

// Refetch stale data when the app comes back to the foreground.
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.canvas, primary: colors.action },
};

function RootNavigator() {
  const { status, app } = useSession();
  useVisitTracker();
  const signedIn = status === 'authenticated';

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return <BootScreen />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="index" />

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={app === 'student'}>
        <Stack.Screen name="(student)" />
      </Stack.Protected>

      <Stack.Protected guard={app === 'business'}>
        <Stack.Screen name="(business)" />
      </Stack.Protected>

      <Stack.Protected guard={app === 'staff'}>
        <Stack.Screen name="staff" />
      </Stack.Protected>

      {/* Detail screens pushed over the tabs; the stack header is styled per screen. */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(shared)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return <BootScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ThemeProvider value={navigationTheme}>
              <ToastProvider>
                <StatusBar style="dark" />
                <RootNavigator />
              </ToastProvider>
            </ThemeProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
