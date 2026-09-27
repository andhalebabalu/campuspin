import { useQuery } from '@tanstack/react-query';
import { messagesService } from '@/services/messages.service';
import { notificationsService } from '@/services/notifications.service';

const POLL_MS = 30_000;

export const unreadKeys = {
  notifications: ['notifications', 'unread'] as const,
  messages: ['conversations', 'unread'] as const,
};

/** Unread notifications, refreshed every 30 s while the app is open. */
export function useUnreadNotifications(): number {
  const { data } = useQuery({
    queryKey: unreadKeys.notifications,
    queryFn: ({ signal }) => notificationsService.unreadCount(signal).then((r) => r.data.unread),
    refetchInterval: POLL_MS,
  });
  return data ?? 0;
}

/** Marketplace conversations with unread messages. Only students have a marketplace. */
export function useUnreadMessages(enabled = true): number {
  const { data } = useQuery({
    queryKey: unreadKeys.messages,
    queryFn: ({ signal }) => messagesService.unreadCount(signal).then((r) => r.data.unread),
    refetchInterval: POLL_MS,
    enabled,
  });
  return data ?? 0;
}
