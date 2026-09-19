'use client';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-bold">Something went wrong.</h1>
      <p className="text-body">
        We couldn&apos;t load this page. You can try again, and if it keeps happening please let us
        know{error.digest ? ` (reference ${error.digest})` : ''}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 items-center rounded-md bg-action px-5 font-medium text-white transition-colors hover:bg-action-hover"
      >
        Try again
      </button>
    </main>
  );
}
