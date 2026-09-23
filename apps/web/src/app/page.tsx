import Link from 'next/link';
import { ApiStatus } from '@/components/system/api-status';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';

// Phase 1 foundation page. The real landing page (hero, college search, categories...) is built
// in the public-website phase; this page verifies the web app is wired to the API.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-16 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary-600" />
          {BRAND.name} · foundation build
        </p>
        <h1 className="text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
          Everything You Need Around Your College.
        </h1>
        <p className="max-w-xl text-lg text-body">{BRAND.description}</p>
        <Link
          href={ROUTES.colleges}
          className="inline-flex h-11 w-fit items-center rounded-md bg-action px-5 font-medium text-white transition-colors hover:bg-action-hover"
        >
          Browse colleges
        </Link>
      </header>

      <ApiStatus />
    </main>
  );
}
