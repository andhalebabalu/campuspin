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
  const { status, role, q } = await searchParams;
  const initialRole = role === 'STAFF' ? 'STAFF' : pickParam(ROLE_KEYS, role);
  return (
    <UsersScreen
      key={`${initialRole}|${String(status ?? '')}`}
      initialStatus={pickParam(USER_STATUSES, status)}
      initialRole={initialRole}
      initialQuery={typeof q === 'string' ? q.slice(0, 100) : ''}
    />
  );
}
