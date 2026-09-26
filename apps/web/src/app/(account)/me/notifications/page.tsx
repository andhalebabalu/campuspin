import type { Metadata } from 'next';
import { NotificationsView } from '@/features/account/components/notifications-view';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };

export default function NotificationsPage() {
  return <NotificationsView />;
}
