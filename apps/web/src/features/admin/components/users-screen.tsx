'use client';

import {
  ROLES,
  ROLE_KEYS,
  USER_STATUSES,
  type AdminUser,
  type RoleKey,
  type UserStatus,
} from '@platform/contracts';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/lib/auth/session-context';
import { LastActive } from './last-active';
import { ListingCreditsPanel } from './listing-credits-panel';
import { adminService } from '@/services/admin.service';
import { can } from '../lib/access';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  dateFormat,
  errorMessage,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const STAFF: ReadonlySet<RoleKey> = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Accounts: search and filter, suspend / reactivate (users.manage), and change roles (super admins
 * only). The rank rules (not yourself, not a higher rank, never the last super admin) are enforced
 * by the API; the buttons here are simply hidden where they could never succeed.
 */
export function UsersScreen({
  initialStatus,
  initialRole,
  initialQuery = '',
}: {
  initialStatus: UserStatus | '';
  initialRole: RoleKey | '';
  initialQuery?: string;
}) {
  const { user: me } = useSession();
  const [qInput, setQInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<UserStatus | ''>(initialStatus);
  const [role, setRole] = useState<RoleKey | ''>(initialRole);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const [editingRoles, setEditingRoles] = useState<string | null>(null);
  const [creditsFor, setCreditsFor] = useState<string | null>(null);

  const list = useAdminList(
    (signal) =>
      adminService.users(
        { page, ...(q ? { q } : {}), ...(status ? { status } : {}), ...(role ? { role } : {}) },
        signal,
      ),
    [q, status, role, page],
  );
  const update = (next: AdminUser) => list.replace((item) => item.id === next.id, next);

  const canManage = can(me, 'users.manage');
  const isSuper = Boolean(me?.roles.includes('SUPER_ADMIN'));
  const canCredit = can(me, 'settings.manage');
  const mayAct = (target: AdminUser) =>
    target.id !== me?.id && (isSuper || !target.roles.some((key) => STAFF.has(key)));

  return (
    <div>
      <AdminHeader title="Users" description="Every account, newest first." />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="mb-4 flex flex-wrap gap-3"
      >
        <input
          type="search"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          placeholder="Name or email"
          aria-label="Search users"
          className={`${SEARCH_CLASSES} w-64`}
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as RoleKey | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All roles</option>
          {ROLE_KEYS.map((key) => (
            <option key={key} value={key}>
              {ROLES[key].name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as UserStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {USER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0) + value.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          Search
        </Button>
      </form>

      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No users" description="No accounts match this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((target) => (
            <li key={target.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{target.name}</span>
                      {target.id === me?.id && <Badge>You</Badge>}
                      {target.status !== 'ACTIVE' && (
                        <Badge tone="danger">{target.status.toLowerCase()}</Badge>
                      )}
                      {!target.emailVerified && <Badge>email not verified</Badge>}
                    </div>
                    <span className="truncate text-sm text-body">{target.email}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {target.roles.map((key) => (
                        <Badge
                          key={key}
                          tone={STAFF.has(key) || key === 'MODERATOR' ? 'accent' : 'neutral'}
                        >
                          {ROLES[key].name}
                        </Badge>
                      ))}
                      {target.business && (
                        <Badge tone="success">{target.business.businessName}</Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      Joined {dateFormat.format(new Date(target.createdAt))}
                      {target.lastLoginAt
                        ? ` · last sign-in ${dateFormat.format(new Date(target.lastLoginAt))}`
                        : ' · never signed in'}
                    </span>
                    <span className="text-xs text-body">
                      <LastActive at={target.lastActiveAt} />
                    </span>
                  </div>
                  {mayAct(target) && (
                    <div className="flex flex-wrap gap-2">
                      {isSuper && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setEditingRoles((current) => (current === target.id ? null : target.id))
                          }
                        >
                          Roles
                        </Button>
                      )}
                      {canCredit && target.roles.includes('STUDENT') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setCreditsFor((current) => (current === target.id ? null : target.id))
                          }
                        >
                          Credits
                        </Button>
                      )}
                      {canManage && target.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setDialog({
                              title: `Suspend ${target.name}?`,
                              description:
                                'They are signed out everywhere and cannot sign in until reactivated.',
                              confirmLabel: 'Suspend',
                              required: true,
                              danger: true,
                              onConfirm: async (reason) =>
                                update((await adminService.suspendUser(target.id, reason)).data),
                            })
                          }
                        >
                          Suspend
                        </Button>
                      )}
                      {canManage && target.status === 'SUSPENDED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setDialog({
                              title: `Reactivate ${target.name}?`,
                              confirmLabel: 'Reactivate',
                              required: false,
                              onConfirm: async (reason) =>
                                update((await adminService.reactivateUser(target.id, reason)).data),
                            })
                          }
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {creditsFor === target.id && <ListingCreditsPanel userId={target.id} />}
                {editingRoles === target.id && (
                  <RolesEditor
                    user={target}
                    onSaved={(next) => {
                      update(next);
                      setEditingRoles(null);
                    }}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function RolesEditor({ user, onSaved }: { user: AdminUser; onSaved: (user: AdminUser) => void }) {
  const [roles, setRoles] = useState<RoleKey[]>(user.roles);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const removing = user.roles.some((key) => !roles.includes(key));

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      onSaved((await adminService.setUserRoles(user.id, roles)).data);
    } catch (caught) {
      setProblem(errorMessage(caught, 'Could not change the roles.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-subtle p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLE_KEYS.map((key) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={roles.includes(key)}
              onChange={(event) =>
                setRoles((current) =>
                  event.target.checked ? [...current, key] : current.filter((role) => role !== key),
                )
              }
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-ink">{ROLES[key].name}</span>
              <span className="block text-xs text-muted">{ROLES[key].description}</span>
            </span>
          </label>
        ))}
      </div>
      {removing && (
        <p className="text-sm text-muted">
          Removing a role signs {user.name} out everywhere so the change applies at once.
        </p>
      )}
      {problem && <p className="text-sm text-danger-700">{problem}</p>}
      <Button
        size="sm"
        className="w-fit"
        loading={saving}
        disabled={roles.length === 0}
        onClick={() => void save()}
      >
        Save roles
      </Button>
    </div>
  );
}
