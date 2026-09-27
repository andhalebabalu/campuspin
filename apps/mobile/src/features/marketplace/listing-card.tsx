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
import { price } from '@/lib/format';
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

/** A grid tile: photo, price, title and where it is. */
export function ListingTile({ listing, width }: { listing: ListingCardData; width: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${price(listing.price)}`}
      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <View>
        <ListingImage url={listing.coverImageUrl} category={listing.category} style={{ height: width * 0.95 }} />
        {listing.status !== 'ACTIVE' ? (
          <View style={styles.status}>
            <Badge label={STATUS_LABELS[listing.status]} tint={STATUS_TINTS[listing.status]} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.priceRow}>
          <AppText variant="heading" color={colors.ink}>
            {price(listing.price)}
          </AppText>
          {listing.negotiable && listing.price > 0 ? (
            <AppText variant="caption" color={colors.accent}>
              Negotiable
            </AppText>
          ) : null}
        </View>
        <AppText variant="smallStrong" color={colors.ink} numberOfLines={2}>
          {listing.title}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {LISTING_CONDITION_LABELS[listing.condition]} ·{' '}
          {listing.distanceKm === null ? listing.college.name : `${listing.distanceKm} km away`}
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
