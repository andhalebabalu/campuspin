import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata: Metadata = { title: 'Create a business account' };

export default function BusinessRegisterPage() {
  return (
    <AuthLayout
      audience="business"
      title="Create your account"
      subtitle={
        <>
          Already have an account?{' '}
          <Link href={ROUTES.businessLogin} className="font-medium text-action hover:text-action-hover">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm accountType="BUSINESS" />
      <p className="text-center text-sm text-muted">
        Not a business?{' '}
        <Link href={ROUTES.registerStudent} className="font-medium text-action hover:text-action-hover">
          Create a student account instead
        </Link>
      </p>
    </AuthLayout>
  );
}
