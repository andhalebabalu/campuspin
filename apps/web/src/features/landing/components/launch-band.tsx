'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';

/**
 * "Be the first to experience CampusPin": an email box that starts a student account with the
 * email already filled in (there is no separate mailing list).
 */
export function LaunchBand() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const inputId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    router.push(
      value
        ? `${ROUTES.registerStudent}?email=${encodeURIComponent(value)}`
        : ROUTES.registerStudent,
    );
  }

  return (
    <section
      aria-labelledby="launch-title"
      className="relative isolate overflow-hidden bg-linear-to-r from-primary-900 via-primary-800 to-accent-700 text-white"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute -right-10 -bottom-24 size-80 rounded-full bg-accent-400/30 blur-3xl" />
        <div className="absolute -top-24 -left-10 size-80 rounded-full bg-primary-500/25 blur-3xl" />
      </div>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-12 text-center">
        <h2 id="launch-title" className="text-2xl font-extrabold sm:text-3xl">
          Be among the first to experience {BRAND.name}.
        </h2>
        <p className="text-sm text-primary-100">
          Live in Ahilyanagar and Pune. Create your free student account in a minute.
        </p>
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex w-full max-w-md items-center gap-1 rounded-full bg-surface p-1.5 shadow-lg"
        >
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <input
            id={inputId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email address"
            className="h-10 min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm text-ink placeholder:text-muted focus-visible:outline-none"
          />
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-650"
          >
            <Icon name="bell" className="size-4" />
            Get Started
          </button>
        </form>
      </div>
    </section>
  );
}
