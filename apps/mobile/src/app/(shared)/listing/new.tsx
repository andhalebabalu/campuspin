import { Stack } from 'expo-router';
import { ListingForm } from '@/features/marketplace/listing-form';

export default function NewListing() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sell something' }} />
      <ListingForm />
    </>
  );
}
