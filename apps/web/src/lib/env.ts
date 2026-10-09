import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url({
    error:
      'NEXT_PUBLIC_API_URL is missing or invalid. Copy apps/web/.env.example to apps/web/.env.local.',
  }),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_BRAND_NAME: z.string().min(1).default('CampusPin'),
  /** Where businesses write for help. Optional: without it, no contact address is shown. */
  NEXT_PUBLIC_SUPPORT_EMAIL: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Legal pages: who runs the service and the Grievance Officer (IT Rules 2021). Optional. */
  NEXT_PUBLIC_LEGAL_ENTITY: z.string().trim().optional(),
  NEXT_PUBLIC_LEGAL_ADDRESS: z.string().trim().optional(),
  NEXT_PUBLIC_LEGAL_JURISDICTION: z.string().trim().optional(),
  NEXT_PUBLIC_GRIEVANCE_OFFICER: z.string().trim().optional(),
  NEXT_PUBLIC_GRIEVANCE_EMAIL: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_GRIEVANCE_PHONE: z.string().trim().optional(),
});

// Next.js only inlines NEXT_PUBLIC_* variables that are referenced literally, so list them explicitly.
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_LEGAL_ENTITY: process.env.NEXT_PUBLIC_LEGAL_ENTITY,
  NEXT_PUBLIC_LEGAL_ADDRESS: process.env.NEXT_PUBLIC_LEGAL_ADDRESS,
  NEXT_PUBLIC_LEGAL_JURISDICTION: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION,
  NEXT_PUBLIC_GRIEVANCE_OFFICER: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER,
  NEXT_PUBLIC_GRIEVANCE_EMAIL: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL,
  NEXT_PUBLIC_GRIEVANCE_PHONE: process.env.NEXT_PUBLIC_GRIEVANCE_PHONE,
});
