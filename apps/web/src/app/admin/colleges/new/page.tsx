import type { Metadata } from 'next';
import { CollegeEditor } from '@/features/admin/components/college-editor';

export const metadata: Metadata = { title: 'New college' };

export default function AdminNewCollegePage() {
  return <CollegeEditor />;
}
