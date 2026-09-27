import { MARKETPLACE_REPORT_REASONS, MESSAGE_MAX, type Conversation, type Message } from '@platform/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ChatHeader, Composer, DaySeparator } from '@/components/chat';
import { ReportSheet } from '@/components/report-sheet';
import {
  AppText,
  Avatar,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingView,
  Sheet,
  SheetOption,
  useToast,
} from '@/components/ui';
import { ListingImage } from '@/features/marketplace/listing-card';
import { unreadKeys } from '@/hooks/use-unread';
import { errorMessage, isApiError } from '@/lib/errors';
import { clockTime, dayLabel, price } from '@/lib/format';
import { messagesService } from '@/services/messages.service';
import { safetyService } from '@/services/safety.service';
import { colors, radius, space } from '@/theme/tokens';

const POLL_MS = 6_000;

/** Newest first (the list is inverted), one entry per id. */
function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
}

/** A buyer–seller chat about one listing. */
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const markRead = () => {
      void messagesService
        .markRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: unreadKeys.messages }))
        .catch(() => undefined);
    };
    Promise.all([messagesService.conversation(id, controller.signal), messagesService.messages(id, undefined, controller.signal)])
      .then(([conversationResult, messageResult]) => {
        setConversation(conversationResult.data);
        setMessages(merge([], messageResult.data.items));
        setOlderCursor(messageResult.data.nextCursor);
        setError(null);
        markRead();
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught);
      });
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      messagesService
        .messages(id)
        .then((result) =>
          setMessages((current) => {
            const next = merge(current ?? [], result.data.items);
            if (next[0]?.id !== current?.[0]?.id) markRead();
            return next;
          }),
        )
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [id, reload, queryClient]);

  async function loadOlder() {
    if (!olderCursor) return;
    const cursor = olderCursor;
    setOlderCursor(null);
    try {
      const result = await messagesService.messages(id, cursor);
      setMessages((current) => merge(current ?? [], result.data.items));
      setOlderCursor(result.data.nextCursor);
    } catch {
      setOlderCursor(cursor);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const result = await messagesService.send(id, body);
      setMessages((current) => merge(current ?? [], [result.data]));
      setText('');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setSending(false);
    }
  }

  function block() {
    if (!conversation) return;
    Alert.alert(`Block ${conversation.other.displayName}?`, 'Neither of you can message the other.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          safetyService
            .block(conversation.other.id)
            .then(() => {
              setConversation({ ...conversation, blocked: true });
              toast(`${conversation.other.displayName} is blocked.`);
            })
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  if (error || !conversation || !messages) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Chat' }} />
        {error ? (
          isApiError(error, 404) ? (
            <EmptyState icon="chatbubbles-outline" title="Chat not found" message="It may have been removed." />
          ) : (
            <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
          )
        ) : (
          <LoadingView />
        )}
      </View>
    );
  }

  const closed =
    conversation.blocked ||
    conversation.listing.status === 'REMOVED' ||
    conversation.listing.status === 'HIDDEN' ||
    conversation.listing.status === 'EXPIRED';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader
        leading={<Avatar name={conversation.other.displayName} size={38} verified={conversation.other.verifiedStudent} />}
        title={conversation.other.displayName}
        subtitle={conversation.role === 'SELLER' ? 'Buyer' : 'Seller'}
        onPressTitle={() => router.push({ pathname: '/member/[id]', params: { id: conversation.other.id } })}
        right={<IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenuOpen(true)} />}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/listing/[id]', params: { id: conversation.listing.id } })}
        style={styles.listingBar}
      >
        <ListingImage url={conversation.listing.coverImageUrl} category="OTHER" style={styles.listingThumb} />
        <View style={styles.flex}>
          <AppText variant="smallStrong" color={colors.ink} numberOfLines={1}>
            {conversation.listing.title}
          </AppText>
          <AppText variant="small" color={colors.action}>
            {price(conversation.listing.price)}
          </AppText>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.placeholder} />
      </Pressable>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            <View style={styles.notice}>
              <Icon name="shield-checkmark" size={13} color={colors.accent} />
              <AppText variant="caption" color={colors.body} style={styles.flex}>
                Meet in a public place on campus and check the item before paying.
              </AppText>
            </View>
          }
          renderItem={({ item, index }) => {
            const older = messages[index + 1];
            const newDay = !older || dayLabel(older.createdAt) !== dayLabel(item.createdAt);
            return (
              <View>
                {newDay ? <DaySeparator label={dayLabel(item.createdAt)} /> : null}
                <View style={[styles.bubbleRow, item.mine ? styles.rowMine : styles.rowTheirs]}>
                  <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <AppText color={item.mine ? colors.surface : colors.ink}>{item.body}</AppText>
                    <AppText
                      variant="caption"
                      color={item.mine ? 'rgba(255,255,255,0.75)' : colors.muted}
                      style={styles.time}
                    >
                      {clockTime(item.createdAt)}
                    </AppText>
                  </View>
                </View>
              </View>
            );
          }}
        />
        {closed ? (
          <View style={styles.closed}>
            <Icon name="lock-closed" size={16} color={colors.muted} />
            <AppText variant="small" style={styles.flex}>
              {conversation.blocked
                ? 'Messaging is off because one of you blocked the other.'
                : 'This listing is no longer available, so the conversation is closed.'}
            </AppText>
          </View>
        ) : (
          <Composer
            value={text}
            onChangeText={setText}
            onSend={() => void send()}
            sending={sending}
            maxLength={MESSAGE_MAX}
          />
        )}
      </KeyboardAvoidingView>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <SheetOption
          icon="pricetag-outline"
          label="View listing"
          onPress={() => {
            setMenuOpen(false);
            router.push({ pathname: '/listing/[id]', params: { id: conversation.listing.id } });
          }}
        />
        <SheetOption
          icon="flag-outline"
          label="Report conversation"
          danger
          onPress={() => {
            setMenuOpen(false);
            setReporting(true);
          }}
        />
        {!conversation.blocked ? (
          <SheetOption
            icon="ban-outline"
            label={`Block ${conversation.other.displayName}`}
            danger
            onPress={() => {
              setMenuOpen(false);
              block();
            }}
          />
        ) : null}
      </Sheet>
      <ReportSheet
        visible={reporting}
        title="Report this conversation"
        reasons={MARKETPLACE_REPORT_REASONS}
        onClose={() => setReporting(false)}
        onSubmit={(dto) => messagesService.report(id, dto)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef2f7' },
  flex: { flex: 1 },
  listingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  listingThumb: { width: 40, height: 40, borderRadius: radius.sm },
  listContent: { paddingHorizontal: space.md, paddingVertical: space.md },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: 320,
    marginVertical: space.md,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  bubbleRow: { flexDirection: 'row', marginTop: 4 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.action, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  time: { alignSelf: 'flex-end', marginTop: 2 },
  closed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
