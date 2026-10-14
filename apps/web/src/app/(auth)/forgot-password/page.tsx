import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold text-primary-800">Reset your password</h1>
        <p className="text-body">
          Remembered it?{' '}
          <Link href={ROUTES.signIn} className="font-medium text-action hover:text-action-hover">
            Sign in
          </Link>
        </p>
      </div>

      <ForgotPasswordForm />
    </main>
  );
}
