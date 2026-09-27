import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Icon } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme/tokens';

/** Staff accounts have no mobile app: moderation and admin work happen in the web admin panel. */
export default function Staff() {
  const { user, logout } = useSession();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Icon name="desktop-outline" size={34} color={colors.action} />
        </View>
        <AppText variant="title" align="center">
          Use the web admin panel
        </AppText>
        <AppText align="center">
          {user?.name ? `${user.name}, your` : 'Your'} account is a staff account. The admin panel
          (verifications, reports and moderation) is only available on the CampusPin website.
        </AppText>
        <AppText variant="small" align="center" color={colors.muted}>
          The mobile app is for students and businesses.
        </AppText>
      </View>
      <Button title="Sign out" variant="outline" icon="log-out-outline" onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xxl, backgroundColor: colors.canvas },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  icon: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});
