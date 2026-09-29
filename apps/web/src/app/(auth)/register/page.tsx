import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { AccountTypeChooser } from '@/features/auth/components/account-type-chooser';
import { AuthLayout } from '@/features/auth/components/auth-layout';

export const metadata: Metadata = { title: 'Create your account' };

/** "Continue as": a student account and a business account are separate sign-ups. */
export default function RegisterChooserPage() {
  return (
    <AuthLayout
      audience="any"
      title="Join CampusPin"
      subtitle={
        <>
          Choose the account that fits you. Already have one?{' '}
          <Link href={ROUTES.signIn} className="font-medium text-action hover:text-action-hover">
            Sign in
          </Link>
        </>
      }
    >
      <AccountTypeChooser mode="register" />
    </AuthLayout>
  );
}
