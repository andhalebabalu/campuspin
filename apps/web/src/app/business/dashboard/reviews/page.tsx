import type { Metadata } from 'next';
import { ReviewsSection } from '@/features/business-dashboard/sections/panels';

export const metadata: Metadata = { title: 'Reviews' };

export default function Page() {
  return <ReviewsSection />;
}
