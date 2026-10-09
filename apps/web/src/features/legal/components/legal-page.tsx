import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { CONTACT_EMAIL, LEGAL } from '@/constants/legal';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const OTHER_PAGES: Array<{ href: string; label: string; icon: IconName }> = [
  { href: ROUTES.privacy, label: 'Privacy Policy', icon: 'shield' },
  { href: ROUTES.terms, label: 'Terms & Conditions', icon: 'file' },
  { href: ROUTES.grievance, label: 'Grievance Officer', icon: 'help' },
];

/** A value from the settings, or a plain "to be published" when it is not set yet. */
export function Detail({ value, children }: { value: string | null; children?: ReactNode }) {
  if (!value)
    return (
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-sm font-medium text-amber-600">
        to be published
      </span>
    );
  return <>{children ?? value}</>;
}

/** Shared look of a legal document: title, date, summary, contents and numbered sections. */
export function LegalPage({
  title,
  intro,
  summary,
  sections,
  current,
}: {
  title: string;
  intro: ReactNode;
  /** "In short" points shown above the full text. */
  summary?: string[];
  sections: LegalSection[];
  current: string;
}) {
  return (
    <main className="flex-1 bg-canvas">
      <header className="border-b border-line bg-linear-to-b from-primary-50/70 to-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6 lg:px-8">
          <nav aria-label="Legal" className="flex flex-wrap gap-2">
            {OTHER_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                aria-current={page.href === current ? 'page' : undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-body transition-colors hover:border-primary-200 hover:text-primary-800 aria-[current=page]:border-primary-800 aria-[current=page]:bg-primary-800 aria-[current=page]:text-white"
              >
                <Icon name={page.icon} className="size-3.5" />
                {page.label}
              </Link>
            ))}
          </nav>
          <h1 className="text-3xl font-extrabold text-primary-800 sm:text-4xl">{title}</h1>
          <p className="text-sm text-muted">Last updated: {LEGAL.updated}</p>
          <div className="max-w-3xl text-base leading-relaxed text-body">{intro}</div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="On this page" className="flex flex-col gap-1">
            <p className="mb-2 text-xs font-bold tracking-[0.12em] text-muted uppercase">
              On this page
            </p>
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-md px-2 py-1.5 text-sm text-body transition-colors hover:bg-subtle hover:text-primary-800"
              >
                <span className="mr-1.5 text-muted tabular-nums">{index + 1}.</span>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="flex max-w-3xl flex-col gap-10">
          {summary && summary.length > 0 && (
            <section
              aria-label="In short"
              className="rounded-xl border border-primary-200 bg-primary-50/60 p-5"
            >
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-primary-800">
                <Icon name="info" className="size-5" />
                In short
              </h2>
              <ul className="flex flex-col gap-2">
                {summary.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-relaxed text-ink">
                    <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent-600" />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="mb-3 text-xl font-bold text-primary-800">
                <span className="mr-2 text-muted tabular-nums">{index + 1}.</span>
                {section.title}
              </h2>
              <div className="legal-prose flex flex-col gap-3 text-[15px] leading-relaxed text-body [&_a]:font-medium [&_a]:text-action [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
                {section.body}
              </div>
            </section>
          ))}

          <section className="rounded-xl border border-line bg-surface p-5 shadow-xs">
            <h2 className="mb-1 text-base font-bold text-primary-800">Questions or complaints?</h2>
            <p className="text-sm text-body">
              Write to our Grievance Officer
              {CONTACT_EMAIL ? (
                <>
                  {' '}
                  at{' '}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-action underline underline-offset-2"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </>
              ) : null}
              . See the{' '}
              <Link
                href={ROUTES.grievance}
                className="font-medium text-action underline underline-offset-2"
              >
                Grievance Officer page
              </Link>{' '}
              for how complaints are handled and how quickly.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
