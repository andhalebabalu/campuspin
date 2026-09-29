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
});

// Next.js only inlines NEXT_PUBLIC_* variables that are referenced literally, so list them explicitly.
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
});
