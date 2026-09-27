import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Avatar, Icon, ListRow, RowGroup, Screen } from '@/components/ui';
import { useUnreadMessages, useUnreadNotifications } from '@/hooks/use-unread';
import { useLightStatusBar } from '@/hooks/use-status-bar';
import { useSession, useUser } from '@/lib/session';
import { colors, heroGradient, radius, space, tints } from '@/theme/tokens';

export default function Me() {
  useLightStatusBar();
  const user = useUser();
  const { logout } = useSession();
  const insets = useSafeAreaInsets();
  const verified = user.student.verified;
  const unreadNotifications = useUnreadNotifications();
  const unreadMessages = useUnreadMessages(verified);

  function confirmLogout() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  const count = (n: number) =>
    n > 0 ? (
      <View style={styles.count}>
        <AppText variant="caption" color={colors.surface}>
          {n > 99 ? '99+' : n}
        </AppText>
      </View>
    ) : undefined;

  return (
    <View style={styles.root}>
      <Screen padded={false}>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + space.xl }]}
        >
          <Avatar name={user.name} size={78} verified={verified} />
          <AppText variant="title" color={colors.surface} align="center">
            {user.name}
          </AppText>
          <AppText variant="small" color="rgba(255,255,255,0.8)">
            {user.email}
          </AppText>
          <View style={[styles.pill, verified ? styles.pillVerified : null]}>
            <Icon name={verified ? 'shield-checkmark' : 'shield-outline'} size={14} color={colors.surface} />
            <AppText variant="smallStrong" color={colors.surface} numberOfLines={1}>
              {verified ? `Verified · ${user.student.college?.name ?? ''}` : 'Not verified yet'}
            </AppText>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {!verified ? (
            <RowGroup>
              <ListRow
                icon="shield-checkmark"
                iconTint={tints.green}
                title="Verify your college"
                subtitle="Unlock group chats and the marketplace"
                onPress={() => router.push('/verification')}
              />
            </RowGroup>
          ) : null}

          <RowGroup>
            <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} right={count(unreadNotifications)} />
            {verified ? (
              <ListRow icon="chatbubble-ellipses-outline" title="Messages" onPress={() => router.push('/messages')} right={count(unreadMessages)} />
            ) : null}
            {verified ? <ListRow icon="albums-outline" title="My listings" onPress={() => router.push('/listings/mine')} /> : null}
            <ListRow icon="person-outline" title="View my public profile" onPress={() => router.push({ pathname: '/member/[id]', params: { id: user.id } })} />
          </RowGroup>

          <RowGroup>
            <ListRow icon="create-outline" title="Edit profile" subtitle="Name, college, course and year" onPress={() => router.push('/profile/edit')} />
            <ListRow icon="school-outline" title="Student verification" subtitle={verified ? 'Verified' : 'Not verified'} onPress={() => router.push('/verification')} />
            <ListRow icon="options-outline" title="Privacy and notifications" onPress={() => router.push('/settings')} />
            <ListRow icon="ban-outline" title="Blocked members" onPress={() => router.push('/blocked')} />
          </RowGroup>

          <RowGroup>
            <ListRow icon="add-circle-outline" iconTint={tints.amber} title="Suggest a place" subtitle="Know a mess or PG we’re missing?" onPress={() => router.push('/suggest-place')} />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    maxWidth: '90%',
  },
  pillVerified: { backgroundColor: 'rgba(44,150,60,0.55)' },
  body: { padding: space.lg, gap: space.lg },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.pin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
