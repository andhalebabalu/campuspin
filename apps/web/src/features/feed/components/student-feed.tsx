'use client';

import type { CommunityPost, ListingCard as ListingCardData } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon, type IconName } from '@/components/ui/icon';
import { StudentBadgeChip } from '@/components/ui/student-badge';
import { ROUTES } from '@/constants/routes';
import { EventBox, PostCard } from '@/features/community/components/post-card';
import { ListingCard } from '@/features/marketplace/components/listing-card';
import { useSession } from '@/lib/auth/session-context';
import { communityService } from '@/services/community.service';
import { marketplaceService } from '@/services/marketplace.service';

interface FeedData {
  events: CommunityPost[];
  posts: CommunityPost[];
  listings: ListingCardData[];
}

/**
 * A verified student's home: what is coming up at their college, the latest from its community and
 * new listings near them — one screen instead of three. Everyone else is shown how to get here.
 */
export function StudentFeed() {
  const { status, user } = useSession();
  const verified = Boolean(user?.student.verified);
  const [data, setData] = useState<FeedData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!verified) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.allSettled([
      communityService.feed({ scope: 'college', category: 'EVENT', limit: 3 }, signal),
      communityService.feed({ scope: 'college', limit: 5 }, signal),
      marketplaceService.browse({ scope: 'nearby', sort: 'newest' }, signal),
    ]).then(([events, posts, listings]) => {
      if (signal.aborted) return;
      if ([events, posts, listings].every((result) => result.status === 'rejected')) {
        setFailed(true);
        return;
      }
      setData({
        events: events.status === 'fulfilled' ? events.value.data.items : [],
        posts:
          posts.status === 'fulfilled'
            ? posts.value.data.items.filter((post) => post.category !== 'EVENT')
            : [],
        listings: listings.status === 'fulfilled' ? listings.value.data.slice(0, 6) : [],
      });
    });
    return () => controller.abort();
  }, [verified]);

  if (status === 'loading') return <Skeleton className="h-96 w-full" />;
  if (!verified) {
    return (
      <EmptyState
        title="Your student feed"
        description="Verify your college to see its events, community and marketplace here in one place."
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

  const actions: Array<{ href: string; label: string; icon: IconName }> = [
    { href: ROUTES.communityNew, label: 'New post', icon: 'sparkles' },
    { href: ROUTES.marketplaceNew, label: 'Sell', icon: 'tag' },
    { href: ROUTES.messages, label: 'Messages', icon: 'chat' },
    { href: ROUTES.meNotifications, label: 'Alerts', icon: 'info' },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Hi, {user?.name.split(' ')[0] ?? 'there'}
        </h1>
        {user && <StudentBadgeChip badge={user.student} size="md" />}
        <ul className="grid grid-cols-4 gap-2 sm:max-w-md">
          {actions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface p-3 text-xs font-medium text-ink hover:border-action"
              >
                <Icon name={action.icon} className="size-5 text-primary-600" />
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {failed ? (
        <p className="text-sm text-muted">Could not load your feed. Try again in a moment.</p>
      ) : !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <Section title="Coming up" href={ROUTES.community} empty="No upcoming events yet.">
            {data.events.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-3">
                {data.events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={ROUTES.communityPost(event.id)}
                      className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 hover:border-action"
                    >
                      <span className="font-semibold text-ink">{event.title}</span>
                      {event.event && <EventBox event={event.event} />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={`${user?.student.college?.name ?? 'Your college'} community`}
            href={ROUTES.community}
            empty="Nothing posted yet. Start the conversation."
          >
            {data.posts.length > 0 && (
              <ul className="flex flex-col gap-3">
                {data.posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="New near you" href={ROUTES.marketplace} empty="No listings nearby yet.">
            {data.listings.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.listings.map((listing) => (
                  <li key={listing.id}>
                    <ListingCard listing={listing} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  href,
  empty,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <Link href={href} className="text-sm font-medium text-action hover:underline">
          See all
        </Link>
      </div>
      {children || <p className="text-sm text-muted">{empty}</p>}
    </section>
  );
}
