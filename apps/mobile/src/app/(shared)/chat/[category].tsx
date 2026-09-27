import DateTimePicker from '@react-native-community/datetimepicker';
import {
  COMMUNITY_BODY_MAX,
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_REPORT_REASONS,
  type CommunityCategory,
  type CommunityPost,
} from '@platform/contracts';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { KeyboardAvoider } from '@/components/keyboard-avoider';
import { ChatHeader, Composer, DaySeparator, ReplyPreview } from '@/components/chat';
import { ReportSheet } from '@/components/report-sheet';
import {
  AppText,
  Button,
  ErrorState,
  Icon,
  LoadingView,
  Sheet,
  SheetOption,
  TextField,
  useToast,
} from '@/components/ui';
import { CATEGORY_META } from '@/features/community/meta';
import { writeSeen } from '@/features/community/seen';
import { errorMessage } from '@/lib/errors';
import { clockTime, dayLabel, eventTime } from '@/lib/format';
import { useUser } from '@/lib/session';
import { communityService } from '@/services/community.service';
import { safetyService } from '@/services/safety.service';
import { colors, palette, radius, space, tints } from '@/theme/tokens';

const POLL_MS = 6_000;
const PAGE = 40;
const NAME_COLOURS = [palette.primary700, palette.accent700, palette.violet600, palette.rose600, palette.teal600, palette.amber600];

function nameColour(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return NAME_COLOURS[hash % NAME_COLOURS.length] ?? palette.primary700;
}

/** Newest first (the list is inverted), one entry per id. */
function merge(current: CommunityPost[], incoming: CommunityPost[]): CommunityPost[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
}

const isCategory = (value: string | undefined): value is CommunityCategory =>
  value !== undefined && (COMMUNITY_CATEGORIES as readonly string[]).includes(value);

export default function CommunityChatScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  if (!isCategory(category)) return <ErrorState error={new Error('Unknown chat')} />;
  return <ChatPane category={category} />;
}

function ChatPane({ category }: { category: CommunityCategory }) {
  const user = useUser();
  const toast = useToast();
  const meta = CATEGORY_META[category];
  const [background, foreground] = tints[meta.tint];
  const collegeName = user.student.college?.name ?? 'your college';

  const [messages, setMessages] = useState<CommunityPost[] | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [replyTo, setReplyTo] = useState<CommunityPost | null>(null);
  const [menuFor, setMenuFor] = useState<CommunityPost | null>(null);
  const [reporting, setReporting] = useState<CommunityPost | null>(null);

  const fetchLatest = useCallback(
    (signal?: AbortSignal) => communityService.feed({ scope: 'college', category, limit: PAGE }, signal),
    [category],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchLatest(controller.signal)
      .then((result) => {
        setMessages(merge([], result.data.items));
        setOlderCursor(result.data.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught);
      });
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      fetchLatest()
        .then((result) => setMessages((current) => merge(current ?? [], result.data.items)))
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [fetchLatest, reload]);

  const newestId = messages?.[0]?.id;
  useEffect(() => {
    if (newestId) void writeSeen(category, newestId);
  }, [category, newestId]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await communityService.feed({ scope: 'college', category, limit: PAGE, cursor: olderCursor });
      setMessages((current) => merge(current ?? [], result.data.items));
      setOlderCursor(result.data.nextCursor);
    } catch {
      // Scrolling up again retries.
    } finally {
      setLoadingOlder(false);
    }
  }

  const replace = (next: CommunityPost) =>
    setMessages((current) => (current ?? []).map((m) => (m.id === next.id ? next : m)));

  async function toggleLike(message: CommunityPost) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      const result =
        message.myReaction === null
          ? await communityService.react(message.id, 'LIKE')
          : await communityService.unreact(message.id);
      replace({ ...message, ...result.data });
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    }
  }

  function remove(message: CommunityPost) {
    Alert.alert('Delete message?', 'It will be deleted for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          communityService
            .remove(message.id)
            .then(() => setMessages((current) => (current ?? []).filter((m) => m.id !== message.id)))
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  function block(message: CommunityPost) {
    Alert.alert(
      `Block ${message.author.displayName}?`,
      'You will no longer see each other’s messages or listings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            safetyService
              .block(message.author.id)
              .then(() => {
                setMessages((current) => (current ?? []).filter((m) => m.author.id !== message.author.id));
                toast(`${message.author.displayName} is blocked.`);
              })
              .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader
        leading={
          <View style={[styles.headerIcon, { backgroundColor: background }]}>
            <Icon name={meta.icon} size={20} color={foreground} />
          </View>
        }
        title={COMMUNITY_CATEGORY_LABELS[category]}
        subtitle={`${collegeName} · ${meta.hint}`}
      />
      <KeyboardAvoider>
        {error ? (
          <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
        ) : !messages ? (
          <LoadingView />
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: background }]}>
              <Icon name={meta.icon} size={28} color={foreground} />
            </View>
            <AppText variant="heading" align="center">
              No messages yet
            </AppText>
            <AppText align="center">Say hello and start the conversation.</AppText>
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              <View style={styles.notice}>
                <Icon name="lock-closed" size={13} color={colors.warning} />
                <AppText variant="caption" color={colors.body} style={styles.flex}>
                  {loadingOlder
                    ? 'Loading earlier messages…'
                    : `Only verified students of ${collegeName} can read this chat. Be kind; report anything that breaks the rules.`}
                </AppText>
              </View>
            }
            renderItem={({ item, index }) => {
              const older = messages[index + 1];
              const newDay = !older || dayLabel(older.createdAt) !== dayLabel(item.createdAt);
              const grouped =
                !newDay &&
                older?.author.id === item.author.id &&
                new Date(item.createdAt).getTime() - new Date(older.createdAt).getTime() < 5 * 60_000;
              return (
                <View>
                  {newDay ? <DaySeparator label={dayLabel(item.createdAt)} /> : null}
                  <Bubble
                    message={item}
                    showName={!grouped}
                    onLongPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                      setMenuFor(item);
                    }}
                    onDoubleTap={() => void toggleLike(item)}
                  />
                </View>
              );
            }}
          />
        )}
        <ChatComposer
          category={category}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSent={(message) => {
            setMessages((current) => merge(current ?? [], [message]));
            setReplyTo(null);
          }}
        />
      </KeyboardAvoider>

      <Sheet visible={menuFor !== null} onClose={() => setMenuFor(null)}>
        {menuFor ? (
          <>
            <SheetOption
              icon="arrow-undo-outline"
              label="Reply"
              onPress={() => {
                setReplyTo(menuFor);
                setMenuFor(null);
              }}
            />
            <SheetOption
              icon={menuFor.myReaction ? 'heart-dislike-outline' : 'heart-outline'}
              label={menuFor.myReaction ? 'Unlike' : 'Like'}
              onPress={() => {
                void toggleLike(menuFor);
                setMenuFor(null);
              }}
            />
            <SheetOption
              icon="copy-outline"
              label="Copy text"
              onPress={() => {
                void Clipboard.setStringAsync(menuFor.body);
                setMenuFor(null);
                toast('Copied');
              }}
            />
            {menuFor.mine ? (
              <SheetOption
                icon="trash-outline"
                label="Delete"
                danger
                onPress={() => {
                  const target = menuFor;
                  setMenuFor(null);
                  remove(target);
                }}
              />
            ) : (
              <>
                <SheetOption
                  icon="person-outline"
                  label={`View ${menuFor.author.displayName}`}
                  onPress={() => {
                    const id = menuFor.author.id;
                    setMenuFor(null);
                    router.push({ pathname: '/member/[id]', params: { id } });
                  }}
                />
                <SheetOption
                  icon="flag-outline"
                  label="Report"
                  danger
                  onPress={() => {
                    setReporting(menuFor);
                    setMenuFor(null);
                  }}
                />
                <SheetOption
                  icon="ban-outline"
                  label={`Block ${menuFor.author.displayName}`}
                  danger
                  onPress={() => {
                    const target = menuFor;
                    setMenuFor(null);
                    block(target);
                  }}
                />
              </>
            )}
          </>
        ) : null}
      </Sheet>

      <ReportSheet
        visible={reporting !== null}
        title="Report this message"
        reasons={COMMUNITY_REPORT_REASONS}
        onClose={() => setReporting(null)}
        onSubmit={(dto) => communityService.reportPost(reporting!.id, dto)}
      />
    </View>
  );
}

function Bubble({
  message,
  showName,
  onLongPress,
  onDoubleTap,
}: {
  message: CommunityPost;
  showName: boolean;
  onLongPress: () => void;
  onDoubleTap: () => void;
}) {
  const mine = message.mine;
  const lastTap = useRef(0);
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs, showName && styles.rowSpaced]}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        onPress={() => {
          const now = Date.now();
          if (now - lastTap.current < 300) onDoubleTap();
          lastTap.current = now;
        }}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        {showName && !mine ? (
          <View style={styles.nameRow}>
            <AppText variant="smallStrong" color={nameColour(message.author.id)} numberOfLines={1}>
              {message.author.displayName}
            </AppText>
            {message.author.verifiedStudent ? <Icon name="school" size={12} color={colors.accent} /> : null}
          </View>
        ) : null}
        {message.replyTo ? (
          <View style={[styles.quote, mine && styles.quoteMine]}>
            <AppText variant="caption" color={colors.action}>
              {message.replyTo.authorName}
            </AppText>
            <AppText variant="small" numberOfLines={2}>
              {message.replyTo.excerpt}
            </AppText>
          </View>
        ) : null}
        {message.title ? <AppText variant="bodyStrong">{message.title}</AppText> : null}
        <AppText color={colors.ink}>{message.body}</AppText>
        {message.event ? (
          <View style={styles.event}>
            <View style={styles.eventLine}>
              <Icon name="calendar" size={14} color={colors.warning} />
              <AppText variant="smallStrong" color={colors.ink}>
                {eventTime(message.event.startsAt)}
              </AppText>
            </View>
            {message.event.location ? (
              <View style={styles.eventLine}>
                <Icon name="location" size={14} color={colors.warning} />
                <AppText variant="small">{message.event.location}</AppText>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.meta}>
          {message.reactionCount > 0 ? (
            <View style={styles.likes}>
              <Icon name={message.myReaction ? 'heart' : 'heart-outline'} size={12} color={colors.danger} />
              <AppText variant="caption" color={colors.body}>
                {message.reactionCount}
              </AppText>
            </View>
          ) : null}
          {message.editedAt ? <AppText variant="caption">edited</AppText> : null}
          <AppText variant="caption">{clockTime(message.createdAt)}</AppText>
        </View>
      </Pressable>
    </View>
  );
}

function ChatComposer({
  category,
  replyTo,
  onCancelReply,
  onSent,
}: {
  category: CommunityCategory;
  replyTo: CommunityPost | null;
  onCancelReply: () => void;
  onSent: (message: CommunityPost) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [place, setPlace] = useState('');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const withEvent = category === 'EVENT' && eventOpen;
      const result = await communityService.create({
        category,
        visibility: 'COLLEGE_ONLY',
        body: text,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        ...(withEvent && startsAt ? { eventStartsAt: startsAt.toISOString() } : {}),
        ...(withEvent && place.trim() ? { eventLocation: place.trim() } : {}),
      });
      onSent(result.data);
      setBody('');
      setEventOpen(false);
      setStartsAt(null);
      setPlace('');
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  const eventFields =
    category === 'EVENT' && eventOpen ? (
      <View style={styles.eventForm}>
        <Button
          title={startsAt ? eventTime(startsAt.toISOString()) : 'Pick date and time'}
          variant="outline"
          size="sm"
          icon="calendar-outline"
          onPress={() => setPicker('date')}
        />
        <TextField placeholder="Where? e.g. Seminar hall (optional)" value={place} onChangeText={setPlace} maxLength={200} />
        {picker ? (
          <DateTimePicker
            value={startsAt ?? new Date()}
            mode={picker}
            minimumDate={new Date()}
            onChange={(event, date) => {
              if (event.type !== 'set' || !date) {
                setPicker(null);
                return;
              }
              setStartsAt(date);
              // Android shows date and time as two dialogs.
              setPicker(picker === 'date' && Platform.OS === 'android' ? 'time' : null);
            }}
          />
        ) : null}
      </View>
    ) : null;

  return (
    <Composer
      inputRef={inputRef}
      value={body}
      onChangeText={setBody}
      onSend={() => void send()}
      sending={busy}
      maxLength={COMMUNITY_BODY_MAX}
      placeholder="Message"
      above={
        <>
          {replyTo ? (
            <ReplyPreview
              name={replyTo.mine ? 'yourself' : replyTo.author.displayName}
              text={replyTo.body}
              onCancel={onCancelReply}
            />
          ) : null}
          {eventFields}
        </>
      }
      leading={
        category === 'EVENT' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add event date and place"
            onPress={() => setEventOpen((open) => !open)}
            style={[styles.attach, eventOpen && { backgroundColor: colors.warningSoft }]}
          >
            <Icon name="calendar" size={20} color={eventOpen ? colors.warning : colors.muted} />
          </Pressable>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef2f7' },
  flex: { flex: 1 },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: space.md, paddingVertical: space.md },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: 320,
    marginVertical: space.md,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: '#fff8e6',
  },
  bubbleRow: { flexDirection: 'row', marginTop: 2 },
  rowSpaced: { marginTop: space.sm },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: 6,
    borderRadius: radius.lg,
    gap: 3,
  },
  bubbleMine: { backgroundColor: '#dcf3e2', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.action,
    backgroundColor: colors.subtle,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    marginBottom: 2,
  },
  quoteMine: { backgroundColor: 'rgba(255,255,255,0.6)' },
  event: {
    gap: 3,
    marginTop: 4,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  eventLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  likes: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  eventForm: { gap: space.sm },
  attach: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
