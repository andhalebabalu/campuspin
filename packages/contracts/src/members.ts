import { z } from 'zod';

/** A college as other resources refer to it. */
export const collegeRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type CollegeRef = z.infer<typeof collegeRefSchema>;

/**
 * What every member response says about student standing. `college` is the VERIFIED college: the
 * only college whose community a member may join and whose name appears on their listings.
 */
export const studentBadgeSchema = z.object({
  verified: z.boolean(),
  college: collegeRefSchema.nullable(),
  verifiedUntil: z.string().nullable(),
});
export type StudentBadge = z.infer<typeof studentBadgeSchema>;

/**
 * How another member appears (community author, marketplace seller): a display name ("Asha K."),
 * the verified badge and college. Never an email, phone, student ID or full surname.
 */
export const memberSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  verifiedStudent: z.boolean(),
  college: collegeRefSchema.nullable(),
});
export type MemberSummary = z.infer<typeof memberSummarySchema>;
