import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarEditor } from '@/components/avatar-editor';
import { AppText, ListRow, RowGroup, Screen } from '@/components/ui';
import { useUnreadNotifications } from '@/hooks/use-unread';
import { useLightStatusBar } from '@/hooks/use-status-bar';
import { useSession, useUser } from '@/lib/session';
import { colors, heroGradient, radius, space, tints } from '@/theme/tokens';

export default function BusinessAccount() {
  useLightStatusBar();
  const user = useUser();
  const { logout } = useSession();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();

  function confirmLogout() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <View style={styles.root}>
      <Screen padded={false}>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + space.xl }]}
        >
          <AvatarEditor size={80} />
          <AppText variant="title" color={colors.surface} align="center">
            {user.name}
          </AppText>
          <AppText variant="small" color="rgba(255,255,255,0.8)">
            {user.email}
          </AppText>
        </LinearGradient>
        <View style={styles.body}>
          <RowGroup>
            <ListRow icon="storefront-outline" title="Business profile" subtitle="Name, contact details and logo" onPress={() => router.push('/business/profile')} />
            <ListRow icon="add-circle-outline" iconTint={tints.green} title="Add a listing" onPress={() => router.push('/business/new-listing')} />
            <ListRow
              icon="notifications-outline"
              title="Notifications"
              subtitle={unread > 0 ? `${unread} unread` : undefined}
              onPress={() => router.push('/notifications')}
            />
          </RowGroup>
          <RowGroup>
            <ListRow icon="information-circle-outline" iconTint={tints.slate} title="About CampusPin" onPress={() => router.push('/about')} />
          </RowGroup>
          <RowGroup>
            <ListRow icon="log-out-outline" title="Sign out" danger onPress={confirmLogout} />
          </RowGroup>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: {
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: radius.xl + 6,
    borderBottomRightRadius: radius.xl + 6,
  },
  body: { padding: space.lg, gap: space.lg },
});
