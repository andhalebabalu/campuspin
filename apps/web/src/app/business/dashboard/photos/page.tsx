import type { Metadata } from 'next';
import { PhotosManager } from '@/features/business-dashboard/sections/photos-manager';

export const metadata: Metadata = { title: 'Photos' };

export default function Page() {
  return <PhotosManager />;
}
