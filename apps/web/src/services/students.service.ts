import {
  profileSchema,
  settingsSchema,
  studentStatusSchema,
  type ConfirmEmailVerification,
  type RequestEmailVerification,
  type UpdateProfile,
  type UpdateSettings,
} from '@platform/contracts';
import { apiClient } from '@/lib/api/client';

/** The signed-in member's student verification, profile and settings. All need a session. */
export const studentsService = {
  status: (signal?: AbortSignal) =>
    apiClient.get('/me/student-verification', {
      schema: studentStatusSchema,
      signal,
      init: { cache: 'no-store' },
    }),

  requestEmail: (dto: RequestEmailVerification) =>
    apiClient.post('/me/student-verification/email', { body: dto, schema: studentStatusSchema }),

  confirmEmail: (dto: ConfirmEmailVerification) =>
    apiClient.post('/me/student-verification/email/confirm', {
      body: dto,
      schema: studentStatusSchema,
    }),

  /** The ID photo goes to private storage; only staff reviewing it can open it. */
  submitDocument: (collegeId: string, file: File) => {
    const form = new FormData();
    form.append('collegeId', collegeId);
    form.append('file', file);
    return apiClient.post('/me/student-verification/document', {
      body: form,
      schema: studentStatusSchema,
    });
  },

  cancel: () => apiClient.delete('/me/student-verification', { schema: studentStatusSchema }),

  profile: (signal?: AbortSignal) =>
    apiClient.get('/me/profile', { schema: profileSchema, signal, init: { cache: 'no-store' } }),

  updateProfile: (dto: UpdateProfile) =>
    apiClient.patch('/me/profile', { body: dto, schema: profileSchema }),

  settings: (signal?: AbortSignal) =>
    apiClient.get('/me/settings', { schema: settingsSchema, signal, init: { cache: 'no-store' } }),

  updateSettings: (dto: UpdateSettings) =>
    apiClient.patch('/me/settings', { body: dto, schema: settingsSchema }),
};
