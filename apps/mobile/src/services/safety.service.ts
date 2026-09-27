import { blockedMemberSchema } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const list = z.array(blockedMemberSchema);

/** Blocking members (community and marketplace share it). */
export const safetyService = {
  blocks: (signal?: AbortSignal) =>
    apiClient.get('/me/blocks', { schema: list, signal }),
  block: (userId: string) => apiClient.post('/me/blocks', { body: { userId }, schema: list }),
  unblock: (userId: string) =>
    apiClient.delete(`/me/blocks/${encodeURIComponent(userId)}`, { schema: list }),
};
