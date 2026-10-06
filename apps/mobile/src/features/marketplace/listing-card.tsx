import {
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITION_LABELS,
  type ListingCard as ListingCardData,
  type ListingCategory,
  type ListingStatus,
} from '@platform/contracts';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Badge, Icon, type IconName } from '@/components/ui';
import { price, timeAgo } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { colors, radius, shadows, space, type Tint } from '@/theme/tokens';

export const STATUS_LABELS: Record<ListingStatus, string> = {
  ACTIVE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  EXPIRED: 'Expired',
  HIDDEN: 'Under review',
  REMOVED: 'Removed',
};

export const STATUS_TINTS: Record<ListingStatus, Tint> = {
  ACTIVE: 'green',
  RESERVED: 'amber',
  SOLD: 'slate',
  EXPIRED: 'slate',
  HIDDEN: 'rose',
  REMOVED: 'rose',
};

export const CATEGORY_ICONS: Record<ListingCategory, IconName> = {
  BOOKS: 'book',
  NOTES: 'document-text',
  ELECTRONICS: 'laptop',
  FURNITURE: 'bed',
  CYCLES: 'bicycle',
  HOSTEL_ESSENTIALS: 'home',
  CLOTHING: 'shirt',
  SPORTS: 'football',
  STATIONERY: 'pencil',
  OTHER: 'cube',
};

/** A listing photo, or a category icon when there is none. */
export function ListingImage({
  url,
  category,
  style,
}: {
  url: string | null;
  category: ListingCategory;
  style?: object;
}) {
  const uri = mediaUrl(url);
  if (uri) {
    return <Image source={{ uri }} style={[styles.image, style]} contentFit="cover" transition={200} />;
  }
  return (
    <View style={[styles.image, styles.placeholder, style]}>
      <Icon name={CATEGORY_ICONS[category]} size={34} color={colors.placeholder} />
    </View>
  );
}

/**
 * A grid tile: photo with a "Verified" tag (every seller is a verified student), title, price,
 * condition and where it is.
 */
export function ListingTile({ listing, width }: { listing: ListingCardData; width: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${price(listing.price)}`}
      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <View>
        <ListingImage url={listing.coverImageUrl} category={listing.category} style={{ height: width * 0.8 }} />
        <View style={styles.status}>
          {listing.status !== 'ACTIVE' ? (
            <Badge label={STATUS_LABELS[listing.status]} tint={STATUS_TINTS[listing.status]} />
          ) : (
            <View style={styles.verified}>
              <Icon name="checkmark-circle" size={12} color={colors.surface} />
              <AppText variant="caption" color={colors.surface}>
                Verified
              </AppText>
            </View>
          )}
        </View>
      </View>
      <View style={styles.body}>
        <AppText variant="smallStrong" color={colors.brand} numberOfLines={1}>
          {listing.title}
        </AppText>
        <View style={styles.priceRow}>
          <AppText variant="heading" color={colors.ink}>
            {price(listing.price)}
          </AppText>
          {listing.negotiable && listing.price > 0 ? (
            <AppText variant="caption" color={colors.muted}>
              Negotiable
            </AppText>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <View style={styles.conditionDot} />
          <AppText variant="caption" color={colors.accent} numberOfLines={1}>
            {LISTING_CONDITION_LABELS[listing.condition]}
          </AppText>
        </View>
        <View style={styles.metaRow}>
          <Icon name="location-outline" size={12} color={colors.muted} />
          <AppText variant="caption" numberOfLines={1} style={styles.flex}>
            {listing.distanceKm === null ? listing.college.name : `${listing.distanceKm} km away`}
          </AppText>
        </View>
        <AppText variant="caption" color={colors.placeholder}>
          {timeAgo(listing.createdAt)}
        </AppText>
      </View>
    </Pressable>
  );
}

/** A row for "my listings" and similar lists. */
export function ListingRow({ listing }: { listing: ListingCardData }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <ListingImage url={listing.coverImageUrl} category={listing.category} style={styles.rowImage} />
      <View style={styles.rowBody}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {listing.title}
        </AppText>
        <AppText variant="smallStrong" color={colors.ink}>
          {price(listing.price)}
        </AppText>
        <View style={styles.rowMeta}>
          <Badge label={STATUS_LABELS[listing.status]} tint={STATUS_TINTS[listing.status]} />
          <AppText variant="caption">{LISTING_CATEGORY_LABELS[listing.category]}</AppText>
        </View>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', backgroundColor: colors.subtle },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  tile: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  status: { position: 'absolute', top: space.sm, left: space.sm },
  body: { padding: space.md, gap: 3 },
  flex: { flex: 1 },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.go,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  conditionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.go, marginHorizontal: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowImage: { width: 72, height: 72, borderRadius: radius.md },
  rowBody: { flex: 1, gap: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
