import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { AppText, Avatar, Badge, Button, EmptyState, ErrorState, LoadingView, useToast } from '@/components/ui';
import { PostCard } from '@/features/community/post-card';
import { errorMessage, isApiError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useUser } from '@/lib/session';
import { communityService } from '@/services/community.service';
import { safetyService } from '@/services/safety.service';
import { colors, radius, space } from '@/theme/tokens';

/** A member's public profile: who they are and, if they allow it, their community posts. */
export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const memberQuery = useQuery({
    queryKey: ['member', id],
    queryFn: ({ signal }) => communityService.member(id, signal).then((r) => r.data),
  });
  const member = memberQuery.data;
  const showPosts = Boolean(member && member.showsActivity && !member.blockedByMe);

  const posts = useInfiniteQuery({
    queryKey: ['community', 'author', id],
    enabled: showPosts,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      communityService.feed({ authorId: id, cursor: pageParam, limit: 20 }, signal).then((r) => r.data),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  async function toggleBlock() {
    if (!member) return;
    setBusy(true);
    try {
      if (member.blockedByMe) await safetyService.unblock(member.id);
      else await safetyService.block(member.id);
      queryClient.setQueryData(['member', id], { ...member, blockedByMe: !member.blockedByMe });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
      void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      toast(member.blockedByMe ? `${member.displayName} is unblocked.` : `${member.displayName} is blocked.`);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  function confirmBlock() {
    if (!member) return;
    if (member.blockedByMe) {
      void toggleBlock();
      return;
    }
    Alert.alert(`Block ${member.displayName}?`, 'You will stop seeing each other’s posts and messages.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void toggleBlock() },
    ]);
  }

  if (memberQuery.isPending) return <LoadingView />;
  if (memberQuery.isError || !member) {
    return isApiError(memberQuery.error, 404) ? (
      <EmptyState icon="person-outline" title="Profile not available" message="This member keeps their profile private." />
    ) : (
      <ErrorState error={memberQuery.error} onRetry={() => void memberQuery.refetch()} />
    );
  }

  const isMe = member.id === me.id;
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];

  const header = (
    <View style={styles.header}>
      <View style={styles.profile}>
        <Avatar name={member.displayName} imageUrl={member.avatarUrl} size={84} verified={member.verifiedStudent} />
        <AppText variant="title" align="center">
          {member.displayName}
        </AppText>
        <View style={styles.badges}>
          {member.verifiedStudent ? <Badge label="Verified student" tint="green" icon="shield-checkmark" /> : null}
          {member.college ? <Badge label={member.college.name} tint="blue" icon="school" /> : null}
        </View>
        <AppText variant="small" align="center">
          {[member.course, member.year ? `Year ${member.year}` : null, `Member since ${formatDate(member.memberSince)}`]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        {!isMe ? (
          <Button
            title={member.blockedByMe ? 'Unblock' : 'Block'}
            variant={member.blockedByMe ? 'secondary' : 'outline'}
            icon={member.blockedByMe ? 'lock-open-outline' : 'ban-outline'}
            size="sm"
            fullWidth={false}
            loading={busy}
            onPress={confirmBlock}
            style={styles.blockButton}
          />
        ) : null}
      </View>
      <AppText variant="heading" style={styles.postsTitle}>
        Posts
      </AppText>
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: isMe ? 'Your profile' : member.displayName }} />
      <FlatList
        data={showPosts ? items : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        renderItem={({ item }) => <PostCard post={item} />}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
        ListEmptyComponent={
          member.blockedByMe ? (
            <AppText variant="small">You blocked this member.</AppText>
          ) : !member.showsActivity ? (
            <AppText variant="small">{member.displayName} keeps their activity private.</AppText>
          ) : posts.isPending ? (
            <LoadingView />
          ) : (
            <AppText variant="small">No posts yet.</AppText>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  list: { padding: space.lg, gap: space.md },
  header: { gap: space.lg },
  profile: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.xs + 2 },
  blockButton: { alignSelf: 'center', marginTop: space.sm },
  postsTitle: { marginTop: space.sm },
});
