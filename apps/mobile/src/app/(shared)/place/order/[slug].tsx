import { Stack, useLocalSearchParams } from 'expo-router';
import { OrderingScreen } from '@/features/orders/ordering-screen';

/** Order for pickup at the counter (no table). */
export default function PickupOrderScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Menu' }} />
      <OrderingScreen slug={slug} />
    </>
  );
}
