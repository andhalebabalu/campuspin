import type { Metadata } from 'next';
import { VerifyEmailStatus } from '@/features/auth/components/verify-email-status';

export const metadata: Metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold text-primary-800">Verify your email</h1>
      </div>

      <VerifyEmailStatus token={token ?? null} initialEmail={email ?? ''} />
    </main>
  );
}
