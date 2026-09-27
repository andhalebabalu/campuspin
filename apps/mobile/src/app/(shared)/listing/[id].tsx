import {
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITION_LABELS,
  LISTING_VISIBILITY_LABELS,
  MARKETPLACE_REPORT_REASONS,
  MESSAGE_MAX,
  type Listing,
  type ListingSellerAction,
} from '@platform/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemberLine } from '@/components/member-line';
import { ReportSheet } from '@/components/report-sheet';
import {
  AppText,
  BackButton,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingView,
  Sheet,
  SheetOption,
  TextField,
  useToast,
} from '@/components/ui';
import { ListingImage, STATUS_LABELS, STATUS_TINTS } from '@/features/marketplace/listing-card';
import { errorMessage, isApiError } from '@/lib/errors';
import { formatDate, price, timeAgo } from '@/lib/format';
import { marketplaceService } from '@/services/marketplace.service';
import { safetyService } from '@/services/safety.service';
import { colors, radius, space } from '@/theme/tokens';

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  const query = useQuery({
    queryKey: ['marketplace', 'listing', id],
    queryFn: ({ signal }) => marketplaceService.listing(id, signal).then((r) => r.data),
  });
  const listing = query.data;

  const setListing = (next: Listing) => {
    queryClient.setQueryData(['marketplace', 'listing', id], next);
    void queryClient.invalidateQueries({ queryKey: ['marketplace', 'browse'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace', 'mine'] });
  };

  async function act(action: ListingSellerAction, done: string) {
    try {
      setListing((await marketplaceService.act(id, action)).data);
      toast(done);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    }
  }

  function remove() {
    Alert.alert('Delete this listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          marketplaceService
            .remove(id)
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
              toast('Listing deleted');
              router.back();
            })
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  function block() {
    if (!listing) return;
    Alert.alert(`Block ${listing.seller.displayName}?`, 'You will stop seeing each other.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          safetyService
            .block(listing.seller.id)
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
              toast(`${listing.seller.displayName} is blocked.`);
              router.back();
            })
            .catch((caught: unknown) => toast(errorMessage(caught), 'error'));
        },
      },
    ]);
  }

  const floatingHeader = (
    <View style={[styles.floating, { top: insets.top + space.xs }]}>
      <BackButton />
      {listing && !listing.mine ? (
        <IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenuOpen(true)} />
      ) : null}
    </View>
  );

  if (query.isPending) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingView />
        {floatingHeader}
      </View>
    );
  }
  if (query.isError || !listing) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 60 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {isApiError(query.error, 404) ? (
          <EmptyState
            icon="pricetag-outline"
            title="Listing not available"
            message="It was sold or removed, or it is not shown to your college."
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
        {floatingHeader}
      </View>
    );
  }

  const photos = listing.images.length > 0 ? listing.images : [null];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => setPhoto(Math.round(event.nativeEvent.contentOffset.x / width))}
          >
            {photos.map((url, index) => (
              <ListingImage
                key={url ?? index}
                url={url}
                category={listing.category}
                style={{ width, height: width * 0.9 }}
              />
            ))}
          </ScrollView>
          {photos.length > 1 ? (
            <View style={styles.dots}>
              {photos.map((url, index) => (
                <View key={url ?? index} style={[styles.dot, index === photo && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <View style={styles.badges}>
            <Badge label={STATUS_LABELS[listing.status]} tint={STATUS_TINTS[listing.status]} />
            <Badge label={LISTING_CATEGORY_LABELS[listing.category]} tint="blue" />
            <Badge label={LISTING_CONDITION_LABELS[listing.condition]} tint="violet" />
          </View>
          <AppText variant="title">{listing.title}</AppText>
          <View style={styles.priceRow}>
            <AppText variant="hero" color={colors.action}>
              {price(listing.price)}
            </AppText>
            {listing.negotiable && listing.price > 0 ? (
              <Badge label="Negotiable" tint="green" icon="swap-horizontal" />
            ) : null}
          </View>

          {listing.status === 'HIDDEN' ? (
            <View style={styles.warning}>
              <Icon name="eye-off" size={16} color={colors.danger} />
              <AppText variant="small" color={colors.ink} style={styles.flex}>
                A moderator hid this listing while they look into it
                {listing.moderationNote ? `: ${listing.moderationNote}` : '.'}
              </AppText>
            </View>
          ) : null}

          <View style={styles.facts}>
            <Fact icon="location-outline" text={listing.distanceKm === null ? listing.college.name : `${listing.distanceKm} km away · ${listing.college.name}`} />
            {listing.location ? <Fact icon="flag-outline" text={`Pickup: ${listing.location}`} /> : null}
            <Fact icon="eye-outline" text={LISTING_VISIBILITY_LABELS[listing.visibility]} />
            {listing.quantity > 1 ? <Fact icon="layers-outline" text={`${listing.quantity} available`} /> : null}
            <Fact icon="time-outline" text={`Listed ${timeAgo(listing.createdAt)}`} />
          </View>

          <AppText variant="subheading">Description</AppText>
          <AppText>{listing.description}</AppText>

          <Card style={styles.sellerCard}>
            <AppText variant="caption">SELLER</AppText>
            <MemberLine member={listing.seller} />
          </Card>

          {listing.mine ? (
            <SellerPanel listing={listing} onAct={act} onRemove={remove} />
          ) : (
            <View style={styles.safety}>
              <Icon name="shield-checkmark-outline" size={18} color={colors.accent} />
              <AppText variant="small" style={styles.flex}>
                Meet in a public place on campus, check the item before paying, and never pay in
                advance to someone you have not met.
              </AppText>
            </View>
          )}
        </View>
      </ScrollView>

      {!listing.mine ? <BuyerBar listing={listing} /> : null}
      {floatingHeader}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <SheetOption
          icon="flag-outline"
          label="Report listing"
          danger
          onPress={() => {
            setMenuOpen(false);
            setReporting(true);
          }}
        />
        <SheetOption
          icon="ban-outline"
          label={`Block ${listing.seller.displayName}`}
          danger
          onPress={() => {
            setMenuOpen(false);
            block();
          }}
        />
      </Sheet>
      <ReportSheet
        visible={reporting}
        title="Report this listing"
        reasons={MARKETPLACE_REPORT_REASONS}
        onClose={() => setReporting(false)}
        onSubmit={(dto) => marketplaceService.report(listing.id, dto)}
      />
    </View>
  );
}

function Fact({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={17} color={colors.muted} />
      <AppText variant="small" color={colors.ink} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function SellerPanel({
  listing,
  onAct,
  onRemove,
}: {
  listing: Listing;
  onAct: (action: ListingSellerAction, done: string) => Promise<void>;
  onRemove: () => void;
}) {
  const { status } = listing;
  const live = status === 'ACTIVE' || status === 'RESERVED';
  return (
    <Card style={styles.sellerPanel}>
      <AppText variant="subheading">Your listing</AppText>
      <AppText variant="small">
        {status === 'EXPIRED'
          ? 'It has expired. Renew it to show it again.'
          : `It stays up until ${formatDate(listing.expiresAt)}.`}
      </AppText>
      <View style={styles.actionGrid}>
        {status === 'ACTIVE' ? (
          <Button title="Mark reserved" variant="secondary" size="sm" fullWidth={false} icon="bookmark-outline" onPress={() => void onAct('reserve', 'Marked reserved')} />
        ) : null}
        {status === 'RESERVED' ? (
          <Button title="Available again" variant="secondary" size="sm" fullWidth={false} icon="refresh" onPress={() => void onAct('unreserve', 'Available again')} />
        ) : null}
        {live ? (
          <Button title="Mark sold" size="sm" fullWidth={false} icon="checkmark-done" onPress={() => void onAct('sold', 'Marked sold. Congrats!')} />
        ) : null}
        {live || status === 'EXPIRED' ? (
          <Button title="Renew 30 days" variant="outline" size="sm" fullWidth={false} icon="time-outline" onPress={() => void onAct('renew', 'Renewed for 30 days')} />
        ) : null}
        {status !== 'HIDDEN' && status !== 'SOLD' ? (
          <Button
            title="Edit"
            variant="outline"
            size="sm"
            fullWidth={false}
            icon="create-outline"
            onPress={() => router.push({ pathname: '/listing/edit/[id]', params: { id: listing.id } })}
          />
        ) : null}
        <Button title="Messages from buyers" variant="outline" size="sm" fullWidth={false} icon="chatbubbles-outline" onPress={() => router.push('/messages')} />
        <Button title="Delete" variant="ghost" size="sm" fullWidth={false} icon="trash-outline" onPress={onRemove} />
      </View>
    </Card>
  );
}

function BuyerBar({ listing }: { listing: Listing }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('Hi! Is this still available?');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const result = await marketplaceService.message(listing.id, message.trim());
      setOpen(false);
      router.push({ pathname: '/messages/[id]', params: { id: result.data.id } });
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
      {listing.conversationId ? (
        <Button
          title="Open your chat with the seller"
          size="lg"
          icon="chatbubbles"
          onPress={() => router.push({ pathname: '/messages/[id]', params: { id: listing.conversationId! } })}
        />
      ) : listing.canMessage ? (
        <Button title="Message the seller" size="lg" icon="chatbubble-ellipses" onPress={() => setOpen(true)} />
      ) : (
        <AppText align="center" variant="smallStrong">
          {listing.status === 'SOLD' ? 'This item has been sold.' : 'The seller is not taking messages right now.'}
        </AppText>
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Message the seller">
        <View style={styles.messageForm}>
          <TextField value={message} onChangeText={setMessage} multiline maxLength={MESSAGE_MAX} autoFocus />
          <Button title="Send message" icon="send" loading={busy} onPress={() => void send()} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  floating: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dots: {
    position: 'absolute',
    bottom: space.xl + space.md,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { width: 20, backgroundColor: colors.surface },
  sheet: {
    marginTop: -space.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.canvas,
    padding: space.lg,
    gap: space.md,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  warning: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  facts: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sellerCard: { gap: space.sm },
  sellerPanel: { gap: space.sm },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  safety: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  messageForm: { gap: space.md, paddingHorizontal: space.sm },
});
