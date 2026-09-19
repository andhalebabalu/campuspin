import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-sm font-medium text-primary-700">404</p>
      <h1 className="text-3xl font-bold">We couldn&apos;t find that page.</h1>
      <p className="text-body">The link may be outdated, or the page may have moved.</p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-md bg-action px-5 font-medium text-white transition-colors hover:bg-action-hover"
      >
        Back to home
      </Link>
    </main>
  );
}
