'use client';

import { ApiClientError } from '@platform/api-client';
import {
  COMMUNITY_BODY_MAX,
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_TITLE_MAX,
  type CommunityCategory,
  type CommunityVisibility,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { firstFieldErrors } from '@/lib/forms/errors';
import { communityService } from '@/services/community.service';
import { CATEGORY_ICONS } from './post-card';

const CARD = 'rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6';

/**
 * Write a post. There is no college picker on purpose: a post always goes to the author's verified
 * college, which the server takes from the account.
 */
export function PostComposer() {
  const router = useRouter();
  const { status, user } = useSession();
  const [category, setCategory] = useState<CommunityCategory>('DISCUSSION');
  const [visibility, setVisibility] = useState<CommunityVisibility>('COLLEGE_ONLY');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [location, setLocation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'loading') return <Skeleton className="h-96 w-full" />;
  if (!user?.student.verified || !user.student.college) {
    return (
      <EmptyState
        title="Verified students only"
        description="Verify your college to post in its community."
        action={
          <Link
            href={status === 'authenticated' ? ROUTES.meVerification : ROUTES.login}
            className="inline-flex h-10 items-center rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover"
          >
            {status === 'authenticated' ? 'Verify my college' : 'Sign in'}
          </Link>
        }
      />
    );
  }
  const college = user.student.college;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await communityService.create({
        category,
        visibility,
        title: title.trim(),
        body: body.trim(),
        ...(category === 'EVENT' && startsAt
          ? { eventStartsAt: new Date(startsAt).toISOString() }
          : {}),
        ...(category === 'EVENT' && location.trim() ? { eventLocation: location.trim() } : {}),
      });
      router.push(ROUTES.communityPost(result.data.id));
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors)
        setErrors(firstFieldErrors(caught.fieldErrors));
      else setFormError(caught instanceof ApiClientError ? caught.message : 'Could not post.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">New post</h1>
        <p className="text-sm text-body">
          Posting in the <strong>{college.name}</strong> community as{' '}
          <span className="inline-flex items-center gap-1 font-medium text-success-700">
            <Icon name="graduation" className="size-4" /> Verified Student
          </span>
          .
        </p>
      </div>
      {formError && <FormAlert message={formError} />}

      <fieldset className={`${CARD} flex flex-col gap-3`}>
        <legend className="sr-only">Category</legend>
        <p className="text-sm font-medium text-ink">What kind of post?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COMMUNITY_CATEGORIES.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                category === value
                  ? 'border-action bg-primary-50 font-medium text-ink'
                  : 'border-line text-body'
              }`}
            >
              <input
                type="radio"
                name="category"
                value={value}
                checked={category === value}
                onChange={() => setCategory(value)}
                className="sr-only"
              />
              <Icon name={CATEGORY_ICONS[value]} className="size-4 shrink-0 text-primary-600" />
              {COMMUNITY_CATEGORY_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`${CARD} flex flex-col gap-4`}>
        <Input
          label="Title"
          value={title}
          maxLength={COMMUNITY_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          error={errors.title}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-body" className="text-sm font-medium text-ink">
            Post
          </label>
          <textarea
            id="post-body"
            rows={7}
            maxLength={COMMUNITY_BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-invalid={errors.body ? true : undefined}
            className={`rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink ${
              errors.body ? 'border-danger-600' : 'border-control'
            }`}
          />
          <p className="flex justify-between text-xs text-muted">
            <span className="text-danger-700">{errors.body}</span>
            <span>
              {body.length}/{COMMUNITY_BODY_MAX}
            </span>
          </p>
        </div>
        {category === 'EVENT' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Starts at"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              error={errors.eventStartsAt}
            />
            <Input
              label="Where (optional)"
              placeholder="e.g. Seminar hall"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              error={errors.eventLocation}
            />
          </div>
        )}
      </div>

      <fieldset className={`${CARD} flex flex-col gap-2`}>
        <legend className="sr-only">Who can see it</legend>
        <p className="text-sm font-medium text-ink">Who can see it?</p>
        {(
          [
            ['COLLEGE_ONLY', 'My college only', `Only verified students of ${college.name}.`],
            ['PUBLIC', 'Public', 'Anyone can read it; only verified students can reply.'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex cursor-pointer items-start gap-2 py-1">
            <input
              type="radio"
              name="visibility"
              checked={visibility === value}
              onChange={() => setVisibility(value)}
              className="mt-1 accent-accent-600"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" loading={busy}>
          Publish
        </Button>
        <Link
          href={ROUTES.community}
          className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium text-ink hover:bg-subtle"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
