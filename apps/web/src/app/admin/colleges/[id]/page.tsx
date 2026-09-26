import type { Metadata } from 'next';
import { CollegeEditor } from '@/features/admin/components/college-editor';

export const metadata: Metadata = { title: 'Edit college' };

export default async function AdminEditCollegePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CollegeEditor collegeId={id} />;
}
