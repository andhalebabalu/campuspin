import type { Metadata } from 'next';
import { OrderDetail } from '@/features/business-dashboard/sections/order-detail';

export const metadata: Metadata = { title: 'Order' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail key={id} orderId={id} />;
}
