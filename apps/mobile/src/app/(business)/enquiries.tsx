import { LEAD_STATUSES, type BusinessLead, type LeadStatus } from '@platform/contracts';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  ChipRow,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Sheet,
  SheetOption,
  TabHeader,
  useToast,
} from '@/components/ui';
import { LEAD_STATUS } from '@/features/business/labels';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { businessService } from '@/services/business.service';
import { colors, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 20;
type Filter = LeadStatus | 'ALL';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...LEAD_STATUSES.map((status) => ({ value: status, label: LEAD_STATUS[status].label })),
];

/** Questions students sent about my listings; reply by call, WhatsApp or email and track status. */
export default function Enquiries() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<BusinessLead | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['business', 'enquiries', { filter, placeId }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      businessService
        .enquiries({ status: filter === 'ALL' ? undefined : filter, placeId: placeId || undefined, page: pageParam }, signal)
        .then((r) => r.data),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length + 1),
  });
  const items = query.data?.pages.flat() ?? [];

  async function setStatus(lead: BusinessLead, status: LeadStatus) {
    try {
      const result = await businessService.updateEnquiry(lead.id, status);
      setOpen((current) => (current?.id === lead.id ? result.data : current));
      void queryClient.invalidateQueries({ queryKey: ['business'] });
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    }
  }

  function openLead(lead: BusinessLead) {
    setOpen(lead);
    if (lead.status === 'NEW') void setStatus(lead, 'SEEN');
  }

  function contact(lead: BusinessLead, how: 'call' | 'whatsapp' | 'email') {
    const phone = lead.contactPhone?.replace(/[^\d+]/g, '') ?? '';
    const url =
      how === 'call'
        ? `tel:${phone}`
        : how === 'whatsapp'
          ? `https://wa.me/${phone.replace(/^\+/, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(`Hi ${lead.student.name}, about your enquiry for ${lead.place.name} on CampusPin:`)}`
          : `mailto:${lead.student.email}?subject=${encodeURIComponent(`Your enquiry about ${lead.place.name}`)}`;
    void Linking.openURL(url).catch(() => toast('No app on this phone can open that.', 'error'));
    if (lead.status === 'NEW' || lead.status === 'SEEN') void setStatus(lead, 'CONTACTED');
  }

  return (
    <View style={styles.root}>
      <TabHeader title="Enquiries" subtitle="Students asking about your places" />
      {placeId ? (
        <Pressable style={styles.filterNote} onPress={() => router.setParams({ placeId: '' })}>
          <AppText variant="small" color={colors.action}>
            Showing one listing · Show all
          </AppText>
        </Pressable>
      ) : null}
      <View style={styles.filters}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.action} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ margin: space.lg }} /> : null}
          ListEmptyComponent={
            <EmptyState icon="mail-open-outline" title="No enquiries yet" message="When students ask about your listings, their questions show up here." />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openLead(item)} style={({ pressed }) => [styles.row, item.status === 'NEW' && styles.rowNew, pressed && { opacity: 0.85 }]}>
              <Avatar name={item.student.name} size={44} />
              <View style={styles.flex}>
                <View style={styles.line}>
                  <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {item.student.name}
                  </AppText>
                  <AppText variant="caption">{timeAgo(item.createdAt)}</AppText>
                </View>
                <AppText variant="small" color={colors.action} numberOfLines={1}>
                  {item.place.name}
                </AppText>
                <AppText variant="small" numberOfLines={2}>
                  {item.message}
                </AppText>
                <Badge label={LEAD_STATUS[item.status].label} tint={LEAD_STATUS[item.status].tint} />
              </View>
            </Pressable>
          )}
        />
      )}

      <Sheet visible={open !== null} onClose={() => setOpen(null)} title={open ? open.student.name : undefined}>
        {open ? (
          <View style={styles.sheet}>
            <AppText variant="small" color={colors.action}>
              About {open.place.name} · {timeAgo(open.createdAt)}
            </AppText>
            <View style={styles.message}>
              <AppText color={colors.ink}>{open.message}</AppText>
            </View>
            <View style={styles.contactRow}>
              {open.contactPhone ? (
                <>
                  <Button title="Call" icon="call" size="sm" style={styles.flex} onPress={() => contact(open, 'call')} />
                  <Button title="WhatsApp" icon="logo-whatsapp" variant="secondary" size="sm" style={styles.flex} onPress={() => contact(open, 'whatsapp')} />
                </>
              ) : null}
              <Button title="Email" icon="mail" variant="outline" size="sm" style={styles.flex} onPress={() => contact(open, 'email')} />
            </View>
            <AppText variant="caption">MARK AS</AppText>
            {LEAD_STATUSES.map((status) => (
              <SheetOption key={status} label={LEAD_STATUS[status].label} selected={open.status === status} onPress={() => void setStatus(open, status)} />
            ))}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  filters: { paddingBottom: space.sm },
  filterNote: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { padding: space.lg, paddingTop: space.sm, gap: space.sm },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowNew: { borderColor: colors.primaryBorder, backgroundColor: '#f5f9ff' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sheet: { gap: space.md, paddingHorizontal: space.sm },
  message: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.subtle },
  contactRow: { flexDirection: 'row', gap: space.sm },
});
