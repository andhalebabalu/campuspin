import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata: Metadata = { title: 'Create a student account' };

export default async function StudentRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { email } = await searchParams;
  return (
    <AuthLayout
      audience="student"
      title="Create your account"
      subtitle={
        <>
          Already have an account?{' '}
          <Link href={ROUTES.login} className="font-medium text-action hover:text-action-hover">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm accountType="STUDENT" initialEmail={typeof email === 'string' ? email : ''} />
      <p className="text-center text-sm text-muted">
        Not a student?{' '}
        <Link
          href={ROUTES.registerBusiness}
          className="font-medium text-action hover:text-action-hover"
        >
          Create a business account instead
        </Link>
      </p>
    </AuthLayout>
  );
}
