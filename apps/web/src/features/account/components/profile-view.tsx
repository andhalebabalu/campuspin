'use client';

import { ApiClientError } from '@platform/api-client';
import type { Profile } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { StudentBadgeChip } from '@/components/ui/student-badge';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { firstFieldErrors } from '@/lib/forms/errors';
import { studentsService } from '@/services/students.service';
import { CollegePicker, type PickedCollege } from './college-picker';

const CARD = 'rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6';

/** The member's own profile: who they are, their student standing, and their details to edit. */
export function ProfileView() {
  const { refreshUser } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    studentsService
      .profile(controller.signal)
      .then((result) => setProfile(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof ApiClientError ? caught.message : 'Could not load your profile.',
          );
      });
    return () => controller.abort();
  }, [reload]);

  if (error) return <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />;
  if (!profile) return <Skeleton className="h-72 w-full" />;

  const initials = profile.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const links: Array<{ href: string; label: string; hint: string; icon: IconName }> = [
    {
      href: ROUTES.feed,
      label: 'My feed',
      hint: 'Events, posts and listings near you',
      icon: 'grid',
    },
    {
      href: ROUTES.meVerification,
      label: 'Student verification',
      hint: profile.student.verified ? 'Verified' : 'Get your Verified Student badge',
      icon: 'graduation',
    },
    {
      href: ROUTES.community,
      label: 'My college community',
      hint: 'Posts, events, notes',
      icon: 'chats',
    },
    {
      href: ROUTES.marketplaceMine,
      label: 'My listings',
      hint: 'Things I am selling',
      icon: 'store',
    },
    { href: ROUTES.messages, label: 'Messages', hint: 'Marketplace conversations', icon: 'chat' },
    {
      href: ROUTES.meNotifications,
      label: 'Notifications',
      hint: 'Everything that happened',
      icon: 'sparkles',
    },
    {
      href: ROUTES.meSettings,
      label: 'Privacy & notifications',
      hint: 'Who sees what, what you hear about',
      icon: 'shield',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className={`${CARD} flex flex-col items-start gap-4 sm:flex-row sm:items-center`}>
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700">
          {initials}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-ink">{profile.name}</h1>
          <StudentBadgeChip badge={profile.student} size="md" />
          <p className="text-sm text-muted">
            {[profile.course, profile.year ? `Year ${profile.year}` : null]
              .filter(Boolean)
              .join(' · ') || 'Add your course and year below'}
            {' · '}Member since{' '}
            {new Date(profile.memberSince).toLocaleDateString('en-IN', {
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex h-full items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs hover:border-action"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon name={link.icon} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{link.label}</span>
                <span className="block text-xs text-muted">{link.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <ProfileForm
        profile={profile}
        onSaved={async (next) => {
          setProfile(next);
          await refreshUser();
        }}
      />
    </div>
  );
}

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [college, setCollege] = useState<PickedCollege | null>(
    profile.college ? { id: profile.college.id, name: profile.college.name, city: '' } : null,
  );
  const [course, setCourse] = useState(profile.course ?? '');
  const [year, setYear] = useState(profile.year ? String(profile.year) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setFormError(null);
    setErrors({});
    try {
      const result = await studentsService.updateProfile({
        name: name.trim(),
        collegeId: college?.id ?? null,
        course: course.trim() || null,
        year: year ? Number(year) : null,
      });
      await onSaved(result.data);
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors)
        setErrors(firstFieldErrors(caught.fieldErrors));
      else setFormError(caught instanceof ApiClientError ? caught.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={`${CARD} flex flex-col gap-4`}>
      <h2 className="text-lg font-bold text-ink">Profile details</h2>
      {formError && <FormAlert message={formError} />}
      <Input
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errors.name}
      />
      <CollegePicker
        label="College you browse"
        value={college}
        onPick={setCollege}
        error={errors.collegeId}
      />
      <p className="-mt-2 text-xs text-muted">
        This only personalises what you see. Your verified college changes only through student
        verification.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Course"
          placeholder="e.g. BCA"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
          error={errors.course}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Year
          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="h-11 rounded-md border border-control bg-surface px-3.5 text-base font-normal text-ink"
          >
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success-700" role="status">
            <Icon name="check" className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
