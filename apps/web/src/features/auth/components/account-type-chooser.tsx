import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';

const CHOICES: ReadonlyArray<{
  key: 'student' | 'business';
  icon: IconName;
  title: string;
  text: string;
  cta: string;
}> = [
  {
    key: 'student',
    icon: 'graduation',
    title: 'Student',
    text: 'Discover places, connect with students and buy & sell.',
    cta: 'Continue as Student',
  },
  {
    key: 'business',
    icon: 'store',
    title: 'Business',
    text: 'Reach nearby students and grow your business.',
    cta: 'Continue as Business',
  },
];

/**
 * "Continue as": the two account types side by side, leading to their own sign-in or sign-up page.
 * `next` is passed through to sign-in so a deep link still lands where it started.
 */
export function AccountTypeChooser({ mode, next }: { mode: 'login' | 'register'; next?: string }) {
  const hrefOf = (key: 'student' | 'business') => {
    const base =
      mode === 'login'
        ? key === 'student'
          ? ROUTES.login
          : ROUTES.businessLogin
        : key === 'student'
          ? ROUTES.registerStudent
          : ROUTES.registerBusiness;
    return next && mode === 'login' ? `${base}?next=${encodeURIComponent(next)}` : base;
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CHOICES.map((choice) => (
        <Link
          key={choice.key}
          href={hrefOf(choice.key)}
          className="group flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span
            className={`flex size-12 items-center justify-center rounded-xl ${choice.key === 'student' ? 'bg-primary-50 text-primary-600' : 'bg-accent-50 text-accent-700'}`}
          >
            <Icon name={choice.icon} className="size-6" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-ink">{choice.title}</span>
            <span className="text-sm text-body">{choice.text}</span>
          </span>
          <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-action group-hover:text-action-hover">
            {choice.cta} <span aria-hidden="true">→</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
