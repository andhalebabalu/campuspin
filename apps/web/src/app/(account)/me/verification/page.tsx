import type { Metadata } from 'next';
import { VerificationView } from '@/features/account/components/verification-view';

export const metadata: Metadata = { title: 'Student verification', robots: { index: false } };

export default function VerificationPage() {
  return <VerificationView />;
}
