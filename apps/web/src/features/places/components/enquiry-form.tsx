'use client';

import { ApiClientError } from '@platform/api-client';
import { createLeadRequestSchema } from '@platform/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { enquiriesService } from '@/services/enquiries.service';

/**
 * "Ask the business": shown on places a business manages. The business receives the message with
 * the student's name, email and (optional) phone, which is why sharing them needs explicit consent.
 */
export function EnquiryForm({
  placeId,
  placeSlug,
  placeName,
}: {
  placeId: string;
  placeSlug: string;
  placeName: string;
}) {
  const { status, user } = useSession();
  const [message, setMessage] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = createLeadRequestSchema.safeParse({
      message,
      ...(contactPhone.trim() ? { contactPhone } : {}),
      consent,
    });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setSending(true);
    try {
      await enquiriesService.send(placeId, parsed.data);
      setSent(true);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors) {
        setErrors(firstFieldErrors(caught.fieldErrors));
      } else {
        setFormError({
          message: caught instanceof ApiClientError ? caught.message : 'Could not send. Try again.',
          requestId: caught instanceof ApiClientError ? caught.requestId : undefined,
        });
      }
    } finally {
      setSending(false);
    }
  }

  let body;
  if (status === 'loading') {
    body = <div className="h-24 animate-pulse rounded-md bg-subtle" />;
  } else if (status === 'unauthenticated' || !user) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body">Sign in with a student account to message {placeName}.</p>
        <Link
          href={`${ROUTES.login}?next=${encodeURIComponent(`${ROUTES.placeDetail(placeSlug)}#enquiry`)}`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-action px-4 text-sm font-medium text-white transition-colors hover:bg-action-hover"
        >
          Sign in to enquire
        </Link>
      </div>
    );
  } else if (!user.roles.includes('STUDENT')) {
    body = <p className="text-body">Enquiries are sent from student accounts.</p>;
  } else if (sent) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <Badge tone="success">Enquiry sent</Badge>
        <p className="text-body">
          {placeName} has your message and contact details and will get back to you directly.
        </p>
      </div>
    );
  } else {
    body = (
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        {formError && <FormAlert message={formError.message} requestId={formError.requestId} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="enquiry-message" className="text-sm font-medium text-ink">
            Your question
          </label>
          <textarea
            id="enquiry-message"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="e.g. Is a double-sharing room available from July? What is the deposit?"
            className={`rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted ${errors.message ? 'border-danger-600' : 'border-control'}`}
          />
          {errors.message && <p className="text-sm text-danger-700">{errors.message}</p>}
        </div>
        <Input
          label="Phone to call you back on (optional)"
          type="tel"
          autoComplete="tel"
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
          error={errors.contactPhone}
        />
        <label className="flex items-start gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Share my name ({user.name}), email ({user.email})
            {contactPhone.trim() ? ' and phone' : ''} with {placeName} so they can reply.
          </span>
        </label>
        {errors.consent && <p className="text-sm text-danger-700">{errors.consent}</p>}
        <Button type="submit" loading={sending} className="w-fit">
          Send enquiry
        </Button>
      </form>
    );
  }

  return (
    <Card id="enquiry" className="flex scroll-mt-24 flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Ask {placeName}</h2>
        <p className="text-sm text-muted">
          Questions about rooms, prices or timings go straight to the owner.
        </p>
      </div>
      {body}
    </Card>
  );
}
