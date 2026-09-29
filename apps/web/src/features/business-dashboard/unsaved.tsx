'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Asks before closing or reloading the tab while `dirty`, so edits are never lost by accident. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/** A bar pinned to the bottom of the section while there are unsaved changes. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  disabled = false,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 pl-5 shadow-lg backdrop-blur">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="size-2 rounded-full bg-amber-600" aria-hidden="true" />
        You have unsaved changes
      </span>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button type="button" onClick={onSave} loading={saving} disabled={disabled}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
