import type { Metadata } from 'next';
import { PlaceEditor } from '@/features/admin/components/place-editor';

export const metadata: Metadata = { title: 'New place' };

export default function AdminNewPlacePage() {
  return <PlaceEditor />;
}
