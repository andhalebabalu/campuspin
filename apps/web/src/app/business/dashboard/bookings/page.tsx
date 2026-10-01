import type { Metadata } from 'next';
import { BookingsSection } from '@/features/business-dashboard/sections/operations';

export const metadata: Metadata = { title: 'Bookings' };

export default function Page() {
  return <BookingsSection />;
}
