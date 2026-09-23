import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '@/features/auth/components/register-form';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Create your account' };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Create your account</h1>
        <p className="text-body">
          Already have one?{' '}
          <Link href={ROUTES.login} className="font-medium text-action hover:text-action-hover">
            Sign in
          </Link>
        </p>
      </div>

      <RegisterForm />
    </main>
  );
}
