import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'Business sign in' };

/** Any account can sign in here; it then lands on its own home (student, business or admin). */
export default async function BusinessLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthLayout
      audience="business"
      title="Sign in"
      subtitle={
        <>
          New to CampusPin?{' '}
          <Link href={ROUTES.registerBusiness} className="font-medium text-action hover:text-action-hover">
            Create a business account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={ROUTES.forgotPassword} className="font-medium text-action hover:text-action-hover">
          Forgot your password?
        </Link>
        <Link href={ROUTES.login} className="text-muted hover:text-ink">
          Student? Sign in here
        </Link>
      </div>
    </AuthLayout>
  );
}
