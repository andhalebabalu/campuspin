import type { Metadata } from 'next';
import { BusinessDetailScreen } from '@/features/admin/components/business-detail-screen';

export const metadata: Metadata = { title: 'Business' };

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BusinessDetailScreen key={id} businessId={id} />;
}
