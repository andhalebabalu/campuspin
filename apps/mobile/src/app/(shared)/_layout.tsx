import { Stack } from 'expo-router';
import { colors, fonts } from '@/theme/tokens';

/** Detail screens reachable from any tab. Each sets its own title. */
export default function SharedLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.canvas },
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
        headerTintColor: colors.ink,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    />
  );
}
