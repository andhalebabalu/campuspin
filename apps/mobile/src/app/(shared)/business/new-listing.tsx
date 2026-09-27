import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { PlaceForm } from '@/features/places/place-form';
import { businessService } from '@/services/business.service';

/** A business lists one of its places; staff review it before students can see it. */
export default function NewBusinessListing() {
  const queryClient = useQueryClient();
  return (
    <>
      <Stack.Screen options={{ title: 'Add a listing' }} />
      <PlaceForm
        variant="business"
        onSubmit={async (dto) => {
          const result = await businessService.createListing(dto);
          void queryClient.invalidateQueries({ queryKey: ['business'] });
          return result;
        }}
      />
    </>
  );
}
