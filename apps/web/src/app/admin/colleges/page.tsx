import type { Metadata } from 'next';
import { CollegesScreen } from '@/features/admin/components/colleges-screen';

export const metadata: Metadata = { title: 'Colleges' };

export default function AdminCollegesPage() {
  return <CollegesScreen />;
}
