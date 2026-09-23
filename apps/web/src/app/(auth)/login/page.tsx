import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/features/auth/components/login-form';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Sign in</h1>
        <p className="text-body">
          New here?{' '}
          <Link href={ROUTES.register} className="font-medium text-action hover:text-action-hover">
            Create an account
          </Link>
        </p>
      </div>

      <LoginForm next={next} />

      <Link
        href={ROUTES.forgotPassword}
        className="text-sm font-medium text-action hover:text-action-hover"
      >
        Forgot your password?
      </Link>
    </main>
  );
}
