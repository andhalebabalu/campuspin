import type { ListingQuota } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { AppText, Icon, type IconName } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { marketplaceService } from '@/services/marketplace.service';
import { colors, radius, space } from '@/theme/tokens';

/** Refreshed with every other marketplace query (create, sell, delete invalidate `marketplace`). */
export function useListingQuota() {
  return useQuery({
    queryKey: ['marketplace', 'quota'],
    queryFn: ({ signal }) => marketplaceService.quota(signal).then((r) => r.data),
  });
}

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`;

/**
 * What the next listing costs, shown on the sell form. Nothing at all while CampusPin has listing
 * limits switched off (every listing free).
 */
export function QuotaBanner({ quota }: { quota: ListingQuota | undefined }) {
  if (!quota?.enabled) return null;
  const balance = Math.max(0, quota.credits);
  const freeLeft = Math.max(0, quota.freeListings - quota.freeUsed);
  const period = quota.mode === 'MONTHLY' ? ' this month' : '';

  const content: { icon: IconName; tone: readonly [string, string]; title: string; text: string } =
    quota.next === 'FREE'
      ? {
          icon: 'gift',
          tone: [colors.accentSoft, colors.accent],
          title: 'This listing is free',
          text: `${freeLeft} of ${quota.freeListings} free ${quota.freeListings === 1 ? 'listing' : 'listings'} left${period}.${
            balance > 0 ? ` You also have ${credits(balance)}.` : ''
          }`,
        }
      : quota.next === 'CREDITS'
        ? {
            icon: 'wallet',
            tone: [colors.actionSoft, colors.action],
            title: `This listing uses ${credits(quota.creditsPerListing)}`,
            text: `Your free listings${period} are used up. You have ${credits(balance)}.`,
          }
        : {
            icon: 'lock-closed',
            tone: [colors.pinSoft, colors.danger],
            title: 'No free listings left',
            text: `Each extra listing costs ${credits(quota.creditsPerListing)} and you have ${credits(balance)}. ${
              quota.mode === 'MONTHLY' && quota.resetsAt
                ? `Free listings come back on ${formatDate(quota.resetsAt)}.`
                : 'Sell or delete a free listing to free a slot.'
            } Contact CampusPin for more credits.`,
          };

  return (
    <View style={[styles.banner, { backgroundColor: content.tone[0] }]}>
      <View style={styles.icon}>
        <Icon name={content.icon} size={20} color={content.tone[1]} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={colors.ink}>
          {content.title}
        </AppText>
        <AppText variant="small" color={colors.ink}>
          {content.text}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 2 },
});
