'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';
import { ShareMenu } from '@/features/business-page/components/share-menu';
import { env } from '@/lib/env';
import { DASHBOARD } from '../routes';
import { useWorkspace } from '../workspace';

export function publicUrlOf(slug: string): string {
  return new URL(ROUTES.businessPage(slug), env.NEXT_PUBLIC_SITE_URL).toString();
}

/** The business's own link: copy it, open it, share it. Honest about whether it is live yet. */
export function PublicLinkCard({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const { dashboard } = useWorkspace();
  const { profile } = dashboard;
  const url = publicUrlOf(profile.slug);
  const shown = url.replace(/^https?:\/\//, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.show('Link copied');
    } catch {
      toast.show('Could not copy. Select the link and copy it.', 'error');
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-gradient-to-br from-primary-700 to-primary-900 p-5 text-white shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Your business page</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.isPublic ? 'bg-accent-600 text-white' : 'bg-white/15 text-primary-100'}`}
        >
          {profile.isPublic ? 'Live' : 'Not live yet'}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white/10 p-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm" title={url}>
          {shown}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50"
        >
          <Icon name="copy" className="size-4" /> Copy
        </button>
      </div>
      {!profile.isPublic && (
        <p className="text-sm text-primary-100">
          This link starts working once our team approves your listing. You can already preview your
          page.
        </p>
      )}
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {profile.isPublic ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
          >
            <Icon name="external" className="size-4" /> View page
          </a>
        ) : null}
        <Link
          href={DASHBOARD.preview}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
        >
          <Icon name="eye" className="size-4" /> Preview
        </Link>
        {profile.isPublic && (
          <div className="[&_button]:h-10 [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-white [&_button]:text-primary-800">
            <ShareMenu
              url={url}
              title={profile.businessName}
              text={`${profile.businessName} on ${BRAND.name}`}
              trackSlug={null}
            />
          </div>
        )}
      </div>
    </section>
  );
}
