import type { Metadata } from 'next';
import { PromotionsScreen } from '@/features/admin/components/promotions-screen';

export const metadata: Metadata = { title: 'Ads & announcements' };

export default function AdminPromotionsPage() {
  return <PromotionsScreen />;
}
