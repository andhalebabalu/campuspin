import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_COMMENT_MAX,
  COMMUNITY_REPORT_REASONS,
  type CommunityComment,
  type CommunityPost,
  type CommunityReactionType,
} from '@platform/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Composer, ReplyPreview } from '@/components/chat';
import { MemberLine } from '@/components/member-line';
import { ReportSheet } from '@/components/report-sheet';
import {
  AppText,
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  Icon,
  LoadingView,
  Sheet,
  SheetOption,
  useToast,
  type IconName,
} from '@/components/ui';
import { CATEGORY_META } from '@/features/community/meta';
import { EventBox } from '@/features/community/post-card';
import { errorMessage, isApiError } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { useUser } from '@/lib/session';
import { communityService } from '@/services/community.service';
import { colors, radius, space } from '@/theme/tokens';

const REACTIONS: { type: CommunityReactionType; label: string; icon: IconName; iconActive: IconName }[] = [
  { type: 'LIKE', label: 'Like', icon: 'heart-outline', iconActive: 'heart' },
  { type: 'HELPFUL', label: 'Helpful', icon: 'checkmark-circle-outline', iconActive: 'checkmark-circle' },
  { type: 'CELEBRATE', label: 'Celebrate', icon: 'sparkles-outline', iconActive: 'sparkles' },
];

type ReportTarget = { kind: 'post' } | { kind: 'comment'; id: string } | null;

/** One post with its comment thread. Replying needs a verified student who can see the post. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [menu, setMenu] = useState<{ kind: 'post' } | { kind: 'comment'; comment: CommunityComment } | null>(null);
  const [reporting, setReporting] = useState<ReportTarget>(null);

  const postQuery = useQuery({
    queryKey: ['community', 'post', id],
    queryFn: ({ signal }) => communityService.post(id, signal).then((r) => r.data),
  });
  const commentsQuery = useQuery({
    queryKey: ['community', 'post', id, 'comments'],
    queryFn: ({ signal }) => communityService.comments(id, undefined, signal).then((r) => r.data.items),
    enabled: postQuery.isSuccess,
  });
  const post = postQuery.data;

  const setPost = (next: CommunityPost) => queryClient.setQueryData(['community', 'post', id], next);

  async function react(type: CommunityReactionType) {
    if (!post) return;
    try {
      const result =
        post.myReaction === type ? await communityService.unreact(post.id) : await communityService.react(post.id, type);
      setPost({ ...post, ...result.data });
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || !post) return;
    setSending(true);
    try {
      await communityService.comment(post.id, { body, ...(replyTo ? { parentId: replyTo.parentId ?? replyTo.id } : {}) });
      setText('');
      setReplyTo(null);
      setPost({ ...post, commentCount: post.commentCount + 1 });
      void commentsQuery.refetch();
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setSending(false);
    }
  }

  function removePost() {
    Alert.alert('Delete this post?', 'It will be deleted for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          communityService
            .remove(id)
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['community'] });
              void queryClient.invalidateQueries({ queryKey: ['home'] });
              toast('Post deleted');
              router.back();
            })
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  function removeComment(comment: CommunityComment) {
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          communityService
            .removeComment(comment.id)
            .then(() => void commentsQuery.refetch())
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  if (postQuery.isPending) return <LoadingView />;
  if (postQuery.isError || !post) {
    return isApiError(postQuery.error, 404) ? (
      <EmptyState
        icon="document-outline"
        title="Post not available"
        message="It was removed, or it is only visible to verified students of its college."
      />
    ) : (
      <ErrorState error={postQuery.error} onRetry={() => void postQuery.refetch()} />
    );
  }

  const meta = CATEGORY_META[post.category];
  const canReply =
    post.status === 'ACTIVE' &&
    user.student.verified &&
    (post.visibility === 'PUBLIC' || user.student.college?.id === post.college.id);
  const comments = commentsQuery.data ?? [];
  const topLevel = comments.filter((comment) => !comment.parentId);
  const repliesTo = (commentId: string) => comments.filter((comment) => comment.parentId === commentId);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: COMMUNITY_CATEGORY_LABELS[post.category],
          headerRight: () => (
            <Pressable hitSlop={10} onPress={() => setMenu({ kind: 'post' })} accessibilityLabel="More">
              <Icon name="ellipsis-horizontal" size={22} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <MemberLine member={post.author} />
            <View style={styles.badges}>
              <Badge label={COMMUNITY_CATEGORY_LABELS[post.category]} tint={meta.tint} icon={meta.icon} />
              <Badge label={post.visibility === 'PUBLIC' ? 'Public' : post.college.name} tint="slate" />
            </View>
            {post.status !== 'ACTIVE' ? (
              <View style={styles.hidden}>
                <Icon name="eye-off" size={15} color={colors.danger} />
                <AppText variant="small" color={colors.ink} style={styles.flex}>
                  Hidden by a moderator{post.moderationNote ? `: ${post.moderationNote}` : '.'}
                </AppText>
              </View>
            ) : null}
            {post.title ? <AppText variant="heading">{post.title}</AppText> : null}
            <AppText color={colors.ink}>{post.body}</AppText>
            {post.event ? <EventBox event={post.event} /> : null}
            <AppText variant="caption">
              {timeAgo(post.createdAt)}
              {post.editedAt ? ' · edited' : ''}
            </AppText>
            <View style={styles.reactions}>
              {REACTIONS.map((reaction) => {
                const active = post.myReaction === reaction.type;
                return (
                  <Pressable
                    key={reaction.type}
                    disabled={!user.student.verified || post.status !== 'ACTIVE'}
                    onPress={() => void react(reaction.type)}
                    style={[styles.reaction, active && styles.reactionActive]}
                  >
                    <Icon name={active ? reaction.iconActive : reaction.icon} size={16} color={active ? colors.action : colors.body} />
                    <AppText variant="smallStrong" color={active ? colors.action : colors.body}>
                      {reaction.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <AppText variant="small">
              {post.reactionCount} {post.reactionCount === 1 ? 'reaction' : 'reactions'} · {post.commentCount}{' '}
              {post.commentCount === 1 ? 'comment' : 'comments'}
            </AppText>
          </View>

          <AppText variant="heading" style={styles.commentsTitle}>
            Comments
          </AppText>
          {commentsQuery.isPending ? (
            <LoadingView />
          ) : topLevel.length === 0 ? (
            <AppText variant="small" style={styles.noComments}>
              No comments yet.{canReply ? ' Be the first.' : ''}
            </AppText>
          ) : (
            <View style={styles.comments}>
              {topLevel.map((comment) => (
                <View key={comment.id} style={styles.thread}>
                  <CommentView comment={comment} onPress={() => setMenu({ kind: 'comment', comment })} />
                  {repliesTo(comment.id).map((reply) => (
                    <View key={reply.id} style={styles.reply}>
                      <CommentView comment={reply} onPress={() => setMenu({ kind: 'comment', comment: reply })} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        {canReply ? (
          <Composer
            value={text}
            onChangeText={setText}
            onSend={() => void send()}
            sending={sending}
            maxLength={COMMUNITY_COMMENT_MAX}
            placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
            above={
              replyTo ? (
                <ReplyPreview name={replyTo.author.displayName} text={replyTo.body} onCancel={() => setReplyTo(null)} />
              ) : undefined
            }
          />
        ) : null}
      </KeyboardAvoidingView>

      <Sheet visible={menu !== null} onClose={() => setMenu(null)}>
        {menu?.kind === 'post' ? (
          post.mine ? (
            <SheetOption icon="trash-outline" label="Delete post" danger onPress={() => { setMenu(null); removePost(); }} />
          ) : (
            <SheetOption icon="flag-outline" label="Report post" danger onPress={() => { setMenu(null); setReporting({ kind: 'post' }); }} />
          )
        ) : menu?.kind === 'comment' ? (
          <>
            {canReply ? (
              <SheetOption icon="arrow-undo-outline" label="Reply" onPress={() => { setReplyTo(menu.comment); setMenu(null); }} />
            ) : null}
            {menu.comment.mine ? (
              <SheetOption icon="trash-outline" label="Delete comment" danger onPress={() => { const c = menu.comment; setMenu(null); removeComment(c); }} />
            ) : (
              <SheetOption icon="flag-outline" label="Report comment" danger onPress={() => { const c = menu.comment; setMenu(null); setReporting({ kind: 'comment', id: c.id }); }} />
            )}
          </>
        ) : null}
      </Sheet>
      <ReportSheet
        visible={reporting !== null}
        title={reporting?.kind === 'comment' ? 'Report this comment' : 'Report this post'}
        reasons={COMMUNITY_REPORT_REASONS}
        onClose={() => setReporting(null)}
        onSubmit={(dto) =>
          reporting?.kind === 'comment' ? communityService.reportComment(reporting.id, dto) : communityService.reportPost(id, dto)
        }
      />
    </View>
  );
}

function CommentView({ comment, onPress }: { comment: CommunityComment; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onPress} style={styles.comment}>
      <Avatar name={comment.author.displayName} size={32} verified={comment.author.verifiedStudent} />
      <View style={styles.flex}>
        <View style={styles.bubble}>
          <AppText variant="smallStrong" color={colors.ink}>
            {comment.author.displayName}
          </AppText>
          <AppText color={colors.ink}>{comment.body}</AppText>
        </View>
        <AppText variant="caption" style={styles.commentMeta}>
          {timeAgo(comment.createdAt)} · Tap for options
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxxl },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  hidden: { flexDirection: 'row', gap: space.sm, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.dangerSoft },
  reactions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reactionActive: { backgroundColor: colors.actionSoft, borderColor: colors.primaryBorder },
  commentsTitle: { marginTop: space.xl, marginBottom: space.md },
  noComments: { paddingVertical: space.md },
  comments: { gap: space.lg },
  thread: { gap: space.md },
  reply: { marginLeft: 42 },
  comment: { flexDirection: 'row', gap: space.sm },
  bubble: { padding: space.md, borderRadius: radius.lg, borderTopLeftRadius: 4, backgroundColor: colors.surface, gap: 2 },
  commentMeta: { marginTop: 4, marginLeft: space.sm },
});
