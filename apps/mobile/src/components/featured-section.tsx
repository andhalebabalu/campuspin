import { PROMOTION_KIND_LABELS, type Promotion, type PromotionKind } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Icon, SectionHeader, type IconName } from '@/components/ui';
import { openLink } from '@/lib/links';
import { mediaUrl } from '@/lib/media';
import { promotionsService } from '@/services/promotions.service';
import { accentGradient, brandGradient, colors, radius, shadows, space } from '@/theme/tokens';

/** Each card counts one view per app launch, not one per re-render or scroll. */
const viewed = new Set<string>();

const KIND_STYLE: Record<PromotionKind, { icon: IconName; colors: readonly [string, string] }> = {
  ANNOUNCEMENT: { icon: 'megaphone', colors: brandGradient },
  NEW_FEATURE: { icon: 'sparkles', colors: accentGradient },
  SPONSORED: { icon: 'rocket', colors: ['#b8321c', colors.pin] },
};

/**
 * The "Featured" cards staff set in the admin panel (new features, boosted businesses), on the
 * student home and the business dashboard. Renders nothing when there are none.
 */
export function FeaturedSection() {
  const { width } = useWindowDimensions();
  const query = useQuery({
    queryKey: ['promotions', 'FEED'],
    queryFn: ({ signal }) => promotionsService.live('FEED', signal).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const items = query.data;

  useEffect(() => {
    for (const item of items ?? []) {
      if (viewed.has(item.id)) continue;
      viewed.add(item.id);
      promotionsService.record(item.id, 'view');
    }
  }, [items]);

  if (!items || items.length === 0) return null;
  const cardWidth = items.length === 1 ? width - space.lg * 2 : Math.min(320, width * 0.8);

  return (
    <View>
      <SectionHeader title="Featured" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
      >
        {items.map((item) => (
          <FeaturedCard key={item.id} item={item} width={cardWidth} />
        ))}
      </ScrollView>
    </View>
  );
}

function FeaturedCard({ item, width }: { item: Promotion; width: number }) {
  const style = KIND_STYLE[item.kind];
  const image = mediaUrl(item.imageUrl);
  const tappable = Boolean(item.ctaLink);

  return (
    <Pressable
      accessibilityRole={tappable ? 'button' : undefined}
      disabled={!tappable}
      onPress={() => {
        promotionsService.record(item.id, 'click');
        void openLink(item.ctaLink);
      }}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={styles.banner}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={style.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <View style={styles.bannerIcon}>
              <Icon name={style.icon} size={54} color="rgba(255,255,255,0.28)" />
            </View>
          </LinearGradient>
        )}
        <View style={styles.kind}>
          <AppText variant="caption" color={colors.surface}>
            {PROMOTION_KIND_LABELS[item.kind]}
          </AppText>
        </View>
      </View>
      <View style={styles.body}>
        <AppText variant="subheading" numberOfLines={2}>
          {item.title}
        </AppText>
        {item.body ? (
          <AppText variant="small" numberOfLines={2}>
            {item.body}
          </AppText>
        ) : null}
        {item.ctaLabel && tappable ? (
          <View style={styles.cta}>
            <AppText variant="smallStrong" color={colors.action}>
              {item.ctaLabel}
            </AppText>
            <Icon name="arrow-forward" size={15} color={colors.action} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.md, paddingRight: space.lg },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.sm,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  banner: { height: 120, justifyContent: 'flex-end' },
  bannerIcon: { position: 'absolute', right: space.lg, top: space.lg },
  kind: {
    alignSelf: 'flex-start',
    margin: space.md,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  body: { padding: space.md, gap: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});
