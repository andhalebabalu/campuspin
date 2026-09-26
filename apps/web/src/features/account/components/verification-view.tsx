'use client';

import { ApiClientError } from '@platform/api-client';
import type { StudentStatus } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { StudentBadgeChip } from '@/components/ui/student-badge';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { firstFieldErrors } from '@/lib/forms/errors';
import { studentsService } from '@/services/students.service';
import { CollegePicker, type PickedCollege } from './college-picker';

type Method = 'email' | 'document';

const CARD = 'rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6';

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

/**
 * The whole student verification journey: pick the college, then either a code sent to the college
 * email or an ID photo for staff. Shows where the member stands (verified, waiting, rejected with
 * the reason, lapsed) and what to do next.
 */
export function VerificationView() {
  const { refreshUser } = useSession();
  const [status, setStatus] = useState<StudentStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    studentsService
      .status(controller.signal)
      .then((result) => {
        setStatus(result.data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(errorText(error, 'Could not load your status.'));
      });
    return () => controller.abort();
  }, [reload]);

  async function update(next: StudentStatus) {
    setStatus(next);
    if (next.state === 'VERIFIED') await refreshUser();
  }

  if (loadError) return <ErrorState message={loadError} onRetry={() => setReload((n) => n + 1)} />;
  if (!status) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusCard status={status} />
      {status.state === 'VERIFIED' ? (
        <section className={CARD}>
          <h2 className="text-lg font-bold text-ink">What you can do now</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href={ROUTES.community}
              className="flex items-center gap-3 rounded-lg border border-line p-4 hover:border-action"
            >
              <Icon name="chats" className="size-6 text-action" />
              <span>
                <span className="block font-semibold text-ink">College community</span>
                <span className="text-sm text-muted">Discussions, events, notes, jobs</span>
              </span>
            </Link>
            <Link
              href={ROUTES.marketplace}
              className="flex items-center gap-3 rounded-lg border border-line p-4 hover:border-action"
            >
              <Icon name="store" className="size-6 text-accent-700" />
              <span>
                <span className="block font-semibold text-ink">Student marketplace</span>
                <span className="text-sm text-muted">Buy, sell and rent with nearby students</span>
              </span>
            </Link>
          </div>
        </section>
      ) : status.pending?.method === 'COLLEGE_EMAIL' ? (
        <CodeStep status={status} onDone={update} />
      ) : status.pending?.method === 'DOCUMENT' ? (
        <WaitingCard status={status} onChange={update} />
      ) : (
        <StartVerification onStarted={update} />
      )}
      <PrivacyNote />
    </div>
  );
}

function StatusCard({ status }: { status: StudentStatus }) {
  const lines: Record<StudentStatus['state'], { title: string; text: string }> = {
    VERIFIED: {
      title: 'You are a Verified Student',
      text: status.badge.verifiedUntil
        ? `Valid until ${new Date(status.badge.verifiedUntil).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.`
        : 'Your college community and the marketplace are open to you.',
    },
    PENDING: {
      title: 'Verification in progress',
      text:
        status.pending?.method === 'DOCUMENT'
          ? 'Staff are checking your student ID. This usually takes a day or two.'
          : 'Enter the code we emailed to your college address.',
    },
    EXPIRED: {
      title: 'Your verification has lapsed',
      text: 'Verify again to keep using your college community and the marketplace.',
    },
    UNVERIFIED: {
      title: 'Verify that you are a student',
      text: 'Browsing places needs no verification. Verified students also get their college community and the student marketplace.',
    },
  };
  const line = lines[status.state];
  return (
    <section className={`${CARD} flex flex-col gap-3`}>
      <StudentBadgeChip badge={status.badge} size="md" />
      <h1 className="text-2xl font-bold text-ink">{line.title}</h1>
      <p className="text-body">{line.text}</p>
      {status.lastDecision && status.state !== 'VERIFIED' && status.lastDecision.reviewNote && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-ink">
          <p className="font-semibold">
            {status.lastDecision.status === 'REJECTED'
              ? 'Your last request was not approved'
              : 'Staff asked you to verify again'}
          </p>
          <p className="mt-1 text-body">Reason: {status.lastDecision.reviewNote}</p>
        </div>
      )}
    </section>
  );
}

function StartVerification({ onStarted }: { onStarted: (status: StudentStatus) => void }) {
  const [method, setMethod] = useState<Method>('email');
  const [college, setCollege] = useState<PickedCollege | null>(null);
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!college) return setErrors({ collegeId: 'Choose your college first' });
    if (method === 'email' && !email.trim())
      return setErrors({ email: 'Enter your college email' });
    if (method === 'document' && !file)
      return setErrors({ file: 'Add a photo of your student ID' });
    setErrors({});
    setBusy(true);
    try {
      const result =
        method === 'email'
          ? await studentsService.requestEmail({ collegeId: college.id, email: email.trim() })
          : await studentsService.submitDocument(college.id, file as File);
      onStarted(result.data);
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors)
        setErrors(firstFieldErrors(error.fieldErrors));
      else setFormError(errorText(error, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={`${CARD} flex flex-col gap-5`}>
      <h2 className="text-lg font-bold text-ink">Verify your college</h2>
      {formError && <FormAlert message={formError} />}
      <CollegePicker value={college} onPick={setCollege} error={errors.collegeId} />

      <div
        className="grid grid-cols-2 gap-2 rounded-lg bg-subtle p-1"
        role="tablist"
        aria-label="Verification method"
      >
        {(
          [
            ['email', 'College email', 'Fastest, verified in a minute'],
            ['document', 'Student ID photo', 'Checked by our staff'],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={method === key}
            onClick={() => setMethod(key)}
            className={`rounded-md px-3 py-2.5 text-left transition-colors ${method === key ? 'bg-surface shadow-xs' : 'hover:bg-surface/60'}`}
          >
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </button>
        ))}
      </div>

      {method === 'email' ? (
        <Input
          label="College email address"
          type="email"
          autoComplete="email"
          placeholder="you@yourcollege.edu.in"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          hint="Only your college's official email domain works. We'll send a 6-digit code."
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="id-photo" className="text-sm font-medium text-ink">
            Photo of your student ID card
          </label>
          <input
            id="id-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="rounded-md border border-dashed border-control bg-canvas px-3.5 py-4 text-sm text-body file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700"
          />
          {errors.file ? (
            <p className="text-sm text-danger-700">{errors.file}</p>
          ) : (
            <p className="text-sm text-muted">
              JPEG, PNG or WebP, up to 5 MB. You may cover your ID number and date of birth: we only
              need your name, the college and the current year.
            </p>
          )}
        </div>
      )}

      <Button type="submit" loading={busy} className="self-start">
        {method === 'email' ? 'Send code' : 'Submit for review'}
      </Button>
    </form>
  );
}

function CodeStep({
  status,
  onDone,
}: {
  status: StudentStatus;
  onDone: (status: StudentStatus) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onDone((await studentsService.confirmEmail({ code: code.trim() })).data);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors)
        setError(firstFieldErrors(caught.fieldErrors).code ?? caught.message);
      else setError(errorText(caught, 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    try {
      onDone((await studentsService.cancel()).data);
    } catch (caught) {
      setError(errorText(caught, 'Could not cancel.'));
    }
  }

  return (
    <form onSubmit={confirm} noValidate className={`${CARD} flex flex-col gap-4`}>
      <h2 className="text-lg font-bold text-ink">Enter your code</h2>
      <p className="text-sm text-body">
        We sent a 6-digit code to <strong>{status.pending?.collegeEmail}</strong> for{' '}
        {status.pending?.college.name}. It expires in 15 minutes.
      </p>
      <Input
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        error={error ?? undefined}
        className="max-w-48 text-center text-lg tracking-[0.4em]"
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy} disabled={code.length !== 6}>
          Verify
        </Button>
        <Button variant="ghost" onClick={() => void startOver()}>
          Use a different email or method
        </Button>
      </div>
    </form>
  );
}

function WaitingCard({
  status,
  onChange,
}: {
  status: StudentStatus;
  onChange: (status: StudentStatus) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={`${CARD} flex flex-col gap-3`}>
      <h2 className="text-lg font-bold text-ink">Waiting for review</h2>
      <p className="text-sm text-body">
        Your student ID for <strong>{status.pending?.college.name}</strong> was sent on{' '}
        {status.pending
          ? new Date(status.pending.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
          : ''}
        . We&apos;ll notify you when staff decide; the photo is deleted right after.
      </p>
      {error && <FormAlert message={error} />}
      <Button
        variant="secondary"
        className="self-start"
        onClick={async () => {
          try {
            onChange((await studentsService.cancel()).data);
          } catch (caught) {
            setError(errorText(caught, 'Could not cancel.'));
          }
        }}
      >
        Cancel this request
      </Button>
    </section>
  );
}

function PrivacyNote() {
  return (
    <section className="flex gap-3 rounded-xl border border-line bg-canvas p-5 text-sm text-body">
      <Icon name="shield" className="size-5 shrink-0 text-accent-700" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-ink">Your privacy</p>
        <p>
          We only check that you study at your college. Other members see &ldquo;Verified
          Student&rdquo; and your college name, never your college email, ID card, ID number or date
          of birth. ID photos are visible only to the staff member reviewing them and are deleted
          once they decide.
        </p>
      </div>
    </section>
  );
}
