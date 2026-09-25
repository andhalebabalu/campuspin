import type { COLLEGE_SORTS, CollegeManagement, CollegeStream } from '@platform/contracts';

/**
 * The college directory's filters, shared by the server page (which reads them from the URL) and
 * the client directory. Kept out of the `'use client'` component: a value exported from a client
 * module becomes a client reference on the server, not the value itself.
 */
export const DIRECTORY_PAGE_SIZE = 12;

export interface DirectoryQuery {
  q: string;
  city: string;
  stream: CollegeStream[];
  management: CollegeManagement[];
  sort: Exclude<(typeof COLLEGE_SORTS)[number], 'nearest'>;
  page: number;
}
