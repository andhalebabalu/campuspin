import {
  duplicateCheckResponseSchema,
  placeSubmissionSchema,
  type CreateSubmissionRequest,
  type DuplicateCheckRequest,
} from '@platform/contracts';
import { apiClient } from '@/lib/api';

export const submissionsService = {
  /** `POST /places/duplicate-check`: needs a session. Best-effort — the create call re-checks server-side. */
  duplicateCheck: (dto: DuplicateCheckRequest, signal?: AbortSignal) =>
    apiClient.post('/places/duplicate-check', {
      body: dto,
      schema: duplicateCheckResponseSchema,
      signal,
    }),

  /** `POST /place-submissions`: needs a session. `409 DUPLICATE_PLACE_SUSPECTED` carries `error.details.candidates`. */
  create: (dto: CreateSubmissionRequest, signal?: AbortSignal) =>
    apiClient.post('/place-submissions', { body: dto, schema: placeSubmissionSchema, signal }),
};
