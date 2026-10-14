import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { CONTACT_EMAIL } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';

/** Only pages that exist are linked: Help Center, Careers and the rest get added when they ship. */
const COLUMNS = [
  {
    title: 'Quick Links',
    links: [
      { href: ROUTES.home, label: 'Home' },
      { href: `${ROUTES.home}#features`, label: 'Features' },
      { href: `${ROUTES.home}#for-students`, label: 'For Students' },
      { href: `${ROUTES.home}#for-businesses`, label: 'For Businesses' },
      { href: `${ROUTES.home}#about`, label: 'About' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { href: ROUTES.search, label: 'Discover places' },
      { href: ROUTES.colleges, label: 'Colleges' },
      { href: ROUTES.community, label: 'Community' },
      { href: ROUTES.marketplace, label: 'Marketplace' },
      { href: ROUTES.suggestPlace, label: 'Suggest a place' },
    ],
  },
  {
    title: 'Support',
    links: [
      ...(CONTACT_EMAIL ? [{ href: `mailto:${CONTACT_EMAIL}`, label: 'Contact Us' }] : []),
      { href: ROUTES.grievance, label: 'Grievance Officer' },
      { href: ROUTES.privacy, label: 'Privacy Policy' },
      { href: ROUTES.terms, label: 'Terms & Conditions' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-primary-900 text-primary-100">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,1fr)_1.1fr] lg:px-8">
        <div className="flex flex-col gap-2">
          <Link
            href={ROUTES.home}
            className="w-fit font-display text-3xl font-extrabold tracking-tight"
          >
            <span className="text-white">Campus</span>
            <span className="text-accent-400">Pin</span>
          </Link>
          <p className="text-xs text-primary-200">{BRAND.tagline}</p>
          <p className="mt-2 max-w-xs text-sm text-primary-200">{BRAND.description}</p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-white">{column.title}</h2>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-primary-200 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div
          aria-hidden="true"
          className="flex items-center gap-1 self-center font-[family-name:var(--font-hand)] text-2xl leading-tight text-white lg:justify-end"
        >
          <span className="-rotate-6">
            Built for students.
            <br />
            Powered by community.{' '}
            <Icon name="heart" className="inline size-4 fill-current text-accent-400" />
          </span>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-primary-200 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </span>
          {/* Required by the ODbL: imported college locations and nearby places come from OSM. */}
          <span>
            Place and map data ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              OpenStreetMap contributors
            </a>
          </span>
          <span>
            Made with <span className="text-rose-600">♥</span> in India
          </span>
        </div>
      </div>
    </footer>
  );
}
