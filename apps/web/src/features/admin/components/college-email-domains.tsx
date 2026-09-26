'use client';

import type { CollegeEmailDomain } from '@platform/contracts';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/lib/auth/session-context';
import { adminService } from '@/services/admin.service';
import { can } from '../lib/access';
import { SEARCH_CLASSES, errorMessage } from './admin-ui';

/**
 * The college's official email domains. A student can verify by email only with an address on one
 * of these (or a subdomain of one), so a wrong entry here would let outsiders in: add only the
 * college's own domains.
 */
export function CollegeEmailDomains({ collegeId }: { collegeId: string }) {
  const { user } = useSession();
  const allowed = can(user, 'verifications.review');
  const [domains, setDomains] = useState<CollegeEmailDomain[] | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    adminService
      .collegeEmailDomains(collegeId, controller.signal)
      .then((result) => setDomains(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(caught, 'Could not load the email domains.'));
      });
    return () => controller.abort();
  }, [allowed, collegeId]);

  if (!allowed) return null;

  async function run(action: () => Promise<{ data: CollegeEmailDomain[] }>) {
    setBusy(true);
    setError(null);
    try {
      setDomains((await action()).data);
      return true;
    } catch (caught) {
      setError(errorMessage(caught, 'That did not work.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const domain = input.trim().toLowerCase().replace(/^@/, '');
    if (!domain) return;
    if (await run(() => adminService.addCollegeEmailDomain(collegeId, domain))) setInput('');
  }

  return (
    <Card className="mt-6 flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-ink">Student email domains</h2>
        <p className="text-sm text-muted">
          Students verify with a college email on one of these domains, e.g.{' '}
          <code>abccollege.edu.in</code>. Removing one does not un-verify anyone.
        </p>
      </div>
      {domains && domains.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center gap-2 rounded-full border border-line bg-subtle px-3 py-1 text-sm text-ink"
            >
              @{domain.domain}
              <button
                type="button"
                aria-label={`Remove ${domain.domain}`}
                disabled={busy}
                className="text-danger-700 hover:underline"
                onClick={() =>
                  void run(() => adminService.removeCollegeEmailDomain(collegeId, domain.id))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {domains && domains.length === 0 && (
        <p className="text-sm text-muted">
          No domains yet: students of this college can verify only with an ID photo.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="New email domain"
          placeholder="abccollege.edu.in"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void add();
            }
          }}
          className={`${SEARCH_CLASSES} flex-1`}
        />
        <Button size="sm" loading={busy} onClick={() => void add()}>
          Add domain
        </Button>
      </div>
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </Card>
  );
}
