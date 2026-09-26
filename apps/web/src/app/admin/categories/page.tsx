import type { Metadata } from 'next';
import { CategoriesScreen } from '@/features/admin/components/categories-screen';

export const metadata: Metadata = { title: 'Categories' };

export default function AdminCategoriesPage() {
  return <CategoriesScreen />;
}
