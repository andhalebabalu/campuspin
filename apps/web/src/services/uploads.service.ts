import { uploadedImageSchema } from '@platform/contracts';
import { apiClient } from '@/lib/api/client';

export const uploadsService = {
  /** `POST /uploads/images` (multipart, needs a session): returns the public URL to store as `imageUrl`. */
  uploadImage: (file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post('/uploads/images', { body: form, schema: uploadedImageSchema, signal });
  },
};
