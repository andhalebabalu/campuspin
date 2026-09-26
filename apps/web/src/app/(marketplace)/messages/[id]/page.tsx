import type { Metadata } from 'next';
import { ConversationThread } from '@/features/marketplace/components/conversation-thread';

export const metadata: Metadata = {
  title: 'Conversation',
  robots: { index: false, follow: false },
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ConversationThread conversationId={id} />
    </div>
  );
}
