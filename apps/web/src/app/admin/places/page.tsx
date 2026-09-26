import type { Metadata } from 'next';
import { PlacesScreen } from '@/features/admin/components/places-screen';

export const metadata: Metadata = { title: 'Places' };

export default function AdminPlacesPage() {
  return <PlacesScreen />;
}
