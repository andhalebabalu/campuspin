import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '@/features/auth/components/register-form';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Create your account' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  // `?type=business` (the "List your business" links) skips the account-type question.
  const initialType = type === 'business' ? 'BUSINESS' : type === 'student' ? 'STUDENT' : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Create your account</h1>
        <p className="text-body">
          {initialType ? 'Tell us a little about you.' : 'First, how will you use it?'} Already have
          an account?{' '}
          <Link href={ROUTES.login} className="font-medium text-action hover:text-action-hover">
            Sign in
          </Link>
        </p>
      </div>

      <RegisterForm key={initialType ?? 'choose'} initialType={initialType} />
    </main>
  );
}
