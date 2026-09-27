import { uploadedImageSchema } from '@platform/contracts';
import { uploadClient } from '@/lib/api';
import { appendFile, type LocalFile } from '@/lib/files';

export const uploadsService = {
  /** `POST /uploads/images` (multipart, needs a session): returns the public URL to store as `imageUrl`. */
  uploadImage: (file: LocalFile, signal?: AbortSignal) => {
    const form = new FormData();
    appendFile(form, 'file', file);
    return uploadClient.post('/uploads/images', { body: form, schema: uploadedImageSchema, signal });
  },
};
