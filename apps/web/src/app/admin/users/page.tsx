import { ROLE_KEYS, USER_STATUSES } from '@platform/contracts';
import type { Metadata } from 'next';
import { UsersScreen } from '@/features/admin/components/users-screen';
import { pickParam, type AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Users' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { status, role } = await searchParams;
  return (
    <UsersScreen
      initialStatus={pickParam(USER_STATUSES, status)}
      initialRole={pickParam(ROLE_KEYS, role)}
    />
  );
}
