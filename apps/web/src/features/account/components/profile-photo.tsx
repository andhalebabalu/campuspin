'use client';

import type { Profile } from '@platform/contracts';
import { useState } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useSession } from '@/lib/auth/session-context';
import { studentsService } from '@/services/students.service';
import { uploadsService } from '@/services/uploads.service';
import { AvatarCropDialog } from './avatar-crop-dialog';
import { ApiClientError } from '@platform/api-client';

/** The member's photo on their profile, with change (crop first) and remove. */
export function ProfilePhoto({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (next: Profile) => void;
}) {
  const { refreshUser } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function apply(avatarUrl: string | null) {
    const result = await studentsService.updateProfile({ avatarUrl });
    onChange(result.data);
    await refreshUser();
  }

  async function save(file: File) {
    try {
      const uploaded = await uploadsService.uploadImage(file);
      await apply(uploaded.data.url);
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
      await apply(null);
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        aria-label={profile.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
      >
        <UserAvatar name={profile.name} url={profile.avatarUrl} className="size-20 text-2xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          {profile.avatarUrl ? 'Change' : 'Add photo'}
        </span>
      </button>
      {profile.avatarUrl && (
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
      <AvatarCropDialog open={open} onClose={() => setOpen(false)} onSave={save} />
    </div>
  );
}
