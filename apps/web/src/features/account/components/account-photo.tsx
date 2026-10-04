'use client';

import { ApiClientError } from '@platform/api-client';
import { useState } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useSession } from '@/lib/auth/session-context';
import { studentsService } from '@/services/students.service';
import { uploadsService } from '@/services/uploads.service';
import { AvatarCropDialog } from './avatar-crop-dialog';

/**
 * The signed-in person's own photo, for any account type (it is the same `PATCH /me/profile`
 * students use). Used where there is no student profile page, such as the business dashboard.
 */
export function AccountPhoto() {
  const { user, refreshUser } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!user) return null;

  async function save(file: File) {
    try {
      const uploaded = await uploadsService.uploadImage(file);
      await studentsService.updateProfile({ avatarUrl: uploaded.data.url });
      await refreshUser();
    } catch (caught) {
      // Shown inside the crop dialog, which stays open.
      throw new Error(
        caught instanceof ApiClientError ? caught.message : 'Could not save the photo.',
      );
    }
  }

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      await studentsService.updateProfile({ avatarUrl: null });
      await refreshUser();
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        aria-label={user.avatarUrl ? 'Change your photo' : 'Add your photo'}
      >
        <UserAvatar name={user.name} url={user.avatarUrl} className="size-16 text-xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          {user.avatarUrl ? 'Change' : 'Add'}
        </span>
      </button>
      <div className="flex flex-col items-start gap-1 text-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-medium text-action hover:text-action-hover"
        >
          {user.avatarUrl ? 'Change photo' : 'Add a photo'}
        </button>
        {user.avatarUrl && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-xs font-medium text-muted hover:text-danger-700 disabled:opacity-50"
          >
            {busy ? 'Removing…' : 'Remove photo'}
          </button>
        )}
        {problem && <p className="text-xs text-danger-700">{problem}</p>}
      </div>
      <AvatarCropDialog open={open} onClose={() => setOpen(false)} onSave={save} />
    </div>
  );
}
