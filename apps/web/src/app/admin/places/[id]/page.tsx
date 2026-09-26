import type { Metadata } from 'next';
import { PlaceEditor } from '@/features/admin/components/place-editor';

export const metadata: Metadata = { title: 'Edit place' };

export default async function AdminEditPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaceEditor placeId={id} />;
}
