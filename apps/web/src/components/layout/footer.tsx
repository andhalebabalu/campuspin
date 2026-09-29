import Link from 'next/link';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';
import { searchHref } from '@/features/search/lib/search-filters';

/** Only pages that exist are linked: About/Careers/Privacy etc. get added when they ship. */
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: ROUTES.search, label: 'Discover' },
      { href: ROUTES.colleges, label: 'Colleges' },
      { href: `${ROUTES.home}#how-it-works`, label: 'How it works' },
      { href: `${ROUTES.home}#for-businesses`, label: 'For businesses' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { href: searchHref({ category: 'rooms' }), label: 'Rooms & PG' },
      { href: searchHref({ category: 'mess' }), label: 'Mess & Tiffin' },
      { href: searchHref({ category: 'libraries' }), label: 'Libraries' },
      { href: searchHref({ category: 'gyms' }), label: 'Gyms' },
    ],
  },
  {
    title: 'Community',
    links: [
      { href: ROUTES.suggestPlace, label: 'Suggest a place' },
      { href: ROUTES.register, label: 'Create an account' },
      { href: ROUTES.signIn, label: 'Log in' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div className="flex flex-col gap-3">
          <Link href={ROUTES.home} className="w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset. */}
            <img src="/logo.png" alt={BRAND.name} width={150} height={40} className="h-10 w-auto" />
          </Link>
          <p className="max-w-xs text-sm text-body">{BRAND.description}</p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-primary-800">{column.title}</h2>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-body hover:text-primary-800">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-6 lg:px-8">
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
              className="underline underline-offset-2 hover:text-ink"
            >
              OpenStreetMap contributors
            </a>
          </span>
          <span>{BRAND.tagline}</span>
        </div>
      </div>
    </footer>
  );
}
