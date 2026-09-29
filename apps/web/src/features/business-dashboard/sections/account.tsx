'use client';

import type { MySubscription } from '@platform/contracts';
import { ApiClientError } from '@platform/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { env } from '@/lib/env';
import { businessService } from '@/services/business.service';
import { StatusBadge } from '../business-shell';
import { DASHBOARD } from '../routes';
import { useWorkspace } from '../workspace';
import { Panel } from './overview';
import { PublicLinkCard } from './public-link';

export function PublicPageSection() {
  const { dashboard, listings } = useWorkspace();
  const { profile } = dashboard;
  const live = listings.filter((listing) => listing.status === 'ACTIVE').length;
  const rules = [
    { ok: profile.status === 'ACTIVE', text: 'Your business is active (not suspended)' },
    { ok: profile.verificationStatus !== 'REJECTED', text: 'Your business was not rejected' },
    { ok: live > 0, text: 'At least one listing is approved by our team' },
  ];
  return (
    <>
      <PageHeader
        title="Public page"
        description="Your mini website on CampusPin: one link for WhatsApp, Instagram and your counter."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PublicLinkCard />
        <Panel title="When is it visible?">
          <ul className="flex flex-col gap-3">
            {rules.map((rule) => (
              <li key={rule.text} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${rule.ok ? 'bg-accent-600 text-white' : 'bg-danger-50 text-danger-700'}`}
                >
                  <Icon name={rule.ok ? 'check' : 'close'} className="size-3" />
                </span>
                <span className={rule.ok ? 'text-body' : 'text-ink'}>{rule.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            The “Verified” badge is separate: our team adds it after checking your business.
          </p>
        </Panel>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          {
            href: DASHBOARD.profile,
            icon: 'store',
            title: 'Business profile',
            text: 'Name, logo, cover, contact, socials',
          },
          {
            href: DASHBOARD.photos,
            icon: 'image',
            title: 'Photos',
            text: 'Your gallery and cover photo',
          },
          {
            href: DASHBOARD.services,
            icon: 'receipt',
            title: 'Services & prices',
            text: 'What you offer and what it costs',
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-md"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <Icon name={card.icon as 'store'} className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink">{card.title}</span>
              <span className="block text-sm text-muted">{card.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function SubscriptionSection() {
  const [data, setData] = useState<MySubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    businessService
      .subscription(controller.signal)
      .then((result) => {
        setData(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load plans.');
      });
    return () => controller.abort();
  }, [reload]);

  return (
    <>
      <PageHeader title="Subscription" description="Listing your business on CampusPin is free." />
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((count) => count + 1)} />
      ) : !data ? (
        <Skeleton className="h-80 w-full rounded-2xl" />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <div>
              <p className="text-sm text-body">Current plan</p>
              <p className="text-xl font-bold text-ink">{data.current.plan.name}</p>
              <p className="text-sm text-muted">
                {data.current.isDefault
                  ? 'Free, with no time limit.'
                  : `Since ${new Date(data.current.startedAt ?? '').toLocaleDateString('en-IN')}${data.current.endsAt ? `, until ${new Date(data.current.endsAt).toLocaleDateString('en-IN')}` : ''}.`}
              </p>
            </div>
            <span className="rounded-full bg-success-50 px-3 py-1 text-sm font-semibold text-success-700">
              Active
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {data.plans.map((plan) => {
              const current = plan.key === data.current.plan.key;
              return (
                <div
                  key={plan.key}
                  className={`flex flex-col gap-4 rounded-2xl border bg-surface p-6 shadow-xs ${current ? 'border-primary-500 ring-2 ring-primary-100' : 'border-line'}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
                      {current ? (
                        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
                          Your plan
                        </span>
                      ) : !plan.isAvailable ? (
                        <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-muted">
                          Coming soon
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-body">{plan.description}</p>
                  </div>
                  <p className="text-2xl font-bold text-ink">
                    {plan.isDefault
                      ? '₹0'
                      : plan.priceMonthly !== null
                        ? `₹${plan.priceMonthly.toLocaleString('en-IN')}`
                        : 'Price to be announced'}
                    {(plan.isDefault || plan.priceMonthly !== null) && (
                      <span className="text-sm font-normal text-muted"> / month</span>
                    )}
                  </p>
                  <ul className="flex flex-1 flex-col gap-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm text-body">
                        <Icon name="check" className="mt-0.5 size-4 text-accent-600" /> {feature}
                      </li>
                    ))}
                  </ul>
                  {!current && (
                    <Button variant="secondary" disabled title="Paid plans are not on sale yet">
                      {plan.isAvailable ? 'Contact us to switch' : 'Not available yet'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-muted">
            Paid plans are not on sale yet: there is no payment on CampusPin today, and nothing will
            be charged without your consent.
          </p>
        </>
      )}
    </>
  );
}

export function SettingsSection() {
  const router = useRouter();
  const { user, logout } = useSession();
  const { dashboard } = useWorkspace();
  const { profile } = dashboard;
  if (!user) return null;
  return (
    <>
      <PageHeader title="Settings" description="Your business account." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Account">
          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-muted">Name</dt>
              <dd className="font-medium text-ink">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Sign-in email</dt>
              <dd className="font-medium text-ink">{user.email}</dd>
              <dd className="text-xs text-muted">Private: never shown on your page.</dd>
            </div>
            <div>
              <dt className="text-muted">Account type</dt>
              <dd className="font-medium text-ink">Business</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Business">
          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-1">
                <StatusBadge profile={profile} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Page link</dt>
              <dd className="font-mono text-ink">{ROUTES.businessPage(profile.slug)}</dd>
              <dd className="text-xs text-muted">Fixed forever, so shared links keep working.</dd>
            </div>
            <div>
              <dt className="text-muted">Member since</dt>
              <dd className="font-medium text-ink">
                {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Security">
          <p className="text-sm text-body">To change your password, we email you a secure link.</p>
          <Link
            href={`${ROUTES.forgotPassword}?email=${encodeURIComponent(user.email)}`}
            className="mt-4 inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            Send me a password link
          </Link>
        </Panel>
        <Panel title="Notifications">
          <p className="text-sm text-body">
            New orders, requests, bookings and account notices always reach you in the app, so you
            never miss a customer.
          </p>
        </Panel>
      </div>
      <Button
        variant="secondary"
        className="mt-6"
        onClick={() => void logout().then(() => router.push(ROUTES.businessLogin))}
      >
        <Icon name="logout" className="size-4" /> Sign out
      </Button>
    </>
  );
}

const FAQ: ReadonlyArray<[string, string]> = [
  [
    'When does my page go live?',
    'As soon as our team approves your first listing, usually within a day. Until then you can build and preview it.',
  ],
  [
    'How do I get the “Verified” badge?',
    'Our team verifies businesses after checking their details. It cannot be bought or requested from the dashboard.',
  ],
  [
    'Can I change my page link?',
    'No. Your link stays the same even if you rename your business, so links you already shared keep working.',
  ],
  [
    'Where do the numbers in Analytics come from?',
    'From real visits to your page and taps on Call, WhatsApp, Directions and Share. We never show estimated or sample numbers.',
  ],
  [
    'Can I remove a bad review?',
    'No. You can report a review that breaks the rules from the review itself; our moderators decide.',
  ],
  ['Do I pay anything?', 'No. Listing on CampusPin is free. Paid plans are not on sale yet.'],
];

export function HelpSection() {
  const support = env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <>
      <PageHeader title="Help & support" description="Answers to what businesses ask most." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <div className="flex flex-col divide-y divide-line">
            {FAQ.map(([question, answer]) => (
              <details key={question} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink">
                  {question}
                  <Icon
                    name="chevronDown"
                    className="size-4 text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-2 text-sm text-body">{answer}</p>
              </details>
            ))}
          </div>
        </Panel>
        {support && (
          <Panel title="Contact us">
            <p className="text-sm text-body">Write to the CampusPin team and we reply by email.</p>
            <a
              href={`mailto:${support}`}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover"
            >
              <Icon name="mail" className="size-4" /> {support}
            </a>
          </Panel>
        )}
      </div>
    </>
  );
}
