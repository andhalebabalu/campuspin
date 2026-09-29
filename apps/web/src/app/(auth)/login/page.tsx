import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { AccountTypeChooser } from '@/features/auth/components/account-type-chooser';
import { AuthLayout } from '@/features/auth/components/auth-layout';

export const metadata: Metadata = { title: 'Sign in' };

/** "Continue as": sends students and businesses to their own sign-in. */
export default async function SignInChooserPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthLayout
      audience="any"
      title="Welcome back"
      subtitle={
        <>
          How do you use CampusPin? New here?{' '}
          <Link href={ROUTES.register} className="font-medium text-action hover:text-action-hover">
            Create an account
          </Link>
        </>
      }
    >
      <AccountTypeChooser mode="login" next={next} />
    </AuthLayout>
  );
}
