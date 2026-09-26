import type { Metadata } from 'next';
import { ConversationsList } from '@/features/marketplace/components/conversations-list';

export const metadata: Metadata = { title: 'Messages', robots: { index: false, follow: false } };

export default function MessagesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ConversationsList />
    </div>
  );
}
