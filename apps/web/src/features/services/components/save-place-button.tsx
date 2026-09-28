'use client';

import { ApiClientError } from '@platform/api-client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { savedPlacesService } from '@/services/saved-places.service';

/** Bookmark a place ("Save mess"). Guests get a sign-in link that brings them back. */
export function SavePlaceButton({
  placeId,
  initialSaved,
  compact = false,
}: {
  placeId: string;
  /** When the caller already knows; otherwise it is read from `/me/saved-places/ids`. */
  initialSaved?: boolean;
  compact?: boolean;
}) {
  const { status } = useSession();
  const pathname = usePathname();
  const toast = useToast();
  const [saved, setSaved] = useState<boolean | null>(initialSaved ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || initialSaved !== undefined) return;
    const controller = new AbortController();
    savedPlacesService
      .ids(controller.signal)
      .then((result) => setSaved(result.data.includes(placeId)))
      .catch(() => setSaved(false));
    return () => controller.abort();
  }, [status, placeId, initialSaved]);

  const classes = compact
    ? 'inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-subtle disabled:opacity-60'
    : 'inline-flex h-11 w-fit items-center justify-center gap-2 rounded-md border border-control px-5 text-sm font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-60';

  if (status === 'unauthenticated') {
    return (
      <Link href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`} className={classes}>
        <Icon name="bookmark" className="size-4" />
        {!compact && 'Sign in to save'}
      </Link>
    );
  }

  async function toggle() {
    if (saved === null) return;
    setBusy(true);
    try {
      if (saved) await savedPlacesService.unsave(placeId);
      else await savedPlacesService.save(placeId);
      setSaved(!saved);
      toast.show(saved ? 'Removed from saved' : 'Saved. You will hear when the menu is out.');
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : 'Could not update.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy || saved === null}
      aria-pressed={saved ?? false}
      className={classes}
    >
      <Icon
        name="bookmark"
        className={`size-4 ${saved ? 'fill-accent-600 text-accent-600' : ''}`}
        label={compact ? (saved ? 'Saved' : 'Save') : undefined}
      />
      {!compact && (saved ? 'Saved' : 'Save')}
    </button>
  );
}
