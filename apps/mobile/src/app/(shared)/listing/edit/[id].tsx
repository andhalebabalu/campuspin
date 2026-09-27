import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState, ErrorState, LoadingView } from '@/components/ui';
import { ListingForm } from '@/features/marketplace/listing-form';
import { marketplaceService } from '@/services/marketplace.service';

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['marketplace', 'listing', id],
    queryFn: ({ signal }) => marketplaceService.listing(id, signal).then((r) => r.data),
  });
  return (
    <>
      <Stack.Screen options={{ title: 'Edit listing' }} />
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.mine ? (
        <EmptyState icon="lock-closed-outline" title="Not your listing" message="Only the seller can edit it." />
      ) : (
        <ListingForm existing={query.data} />
      )}
    </>
  );
}
