import { PROFILE_VISIBILITIES, type ProfileVisibility, type Settings } from '@platform/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';
import { AppText, ErrorState, ListRow, LoadingView, RowGroup, Screen, SheetOption, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { studentsService } from '@/services/students.service';
import { colors, radius, space } from '@/theme/tokens';

const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  PUBLIC: 'Everyone on CampusPin',
  STUDENTS: 'Verified students only',
  PRIVATE: 'Only me',
};

type Toggle = Exclude<keyof Settings, 'profileVisibility'>;

const PRIVACY: { key: Toggle; title: string; subtitle: string }[] = [
  { key: 'showCommunityActivity', title: 'Show my posts on my profile', subtitle: 'Others can see what you post' },
  { key: 'allowMarketplaceMessages', title: 'Allow marketplace messages', subtitle: 'Buyers can message you about your listings' },
];

const NOTIFY: { key: Toggle; title: string }[] = [
  { key: 'notifyCommunity', title: 'Replies and reactions' },
  { key: 'notifyMessages', title: 'Marketplace messages' },
  { key: 'notifyMarketplace', title: 'My listings' },
  { key: 'notifyEvents', title: 'New events at my college' },
  { key: 'notifyJobs', title: 'New jobs and internships' },
  { key: 'notifyPlaceUpdates', title: 'Menus from places I saved' },
];

export default function SettingsScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => studentsService.settings(signal).then((r) => r.data),
  });

  async function change(patch: Partial<Settings>) {
    const previous = query.data;
    if (!previous) return;
    queryClient.setQueryData(['settings'], { ...previous, ...patch });
    try {
      queryClient.setQueryData(['settings'], (await studentsService.updateSettings(patch)).data);
    } catch (caught) {
      queryClient.setQueryData(['settings'], previous);
      toast(errorMessage(caught), 'error');
    }
  }

  const toggle = (key: Toggle) => (
    <Switch
      value={query.data?.[key] ?? false}
      onValueChange={(value) => void change({ [key]: value })}
      trackColor={{ true: colors.action, false: colors.lineStrong }}
      thumbColor={colors.surface}
    />
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Privacy and notifications' }} />
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Screen>
          <View style={styles.stack}>
            <AppText variant="caption">WHO CAN SEE MY PROFILE</AppText>
            <View style={styles.group}>
              {PROFILE_VISIBILITIES.map((value) => (
                <SheetOption
                  key={value}
                  label={VISIBILITY_LABELS[value]}
                  selected={query.data.profileVisibility === value}
                  onPress={() => void change({ profileVisibility: value })}
                />
              ))}
            </View>

            <AppText variant="caption">PRIVACY</AppText>
            <RowGroup>
              {PRIVACY.map((item) => (
                <ListRow key={item.key} title={item.title} subtitle={item.subtitle} right={toggle(item.key)} />
              ))}
            </RowGroup>

            <AppText variant="caption">NOTIFY ME ABOUT</AppText>
            <RowGroup>
              {NOTIFY.map((item) => (
                <ListRow key={item.key} title={item.title} right={toggle(item.key)} />
              ))}
            </RowGroup>
          </View>
        </Screen>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xs },
});
