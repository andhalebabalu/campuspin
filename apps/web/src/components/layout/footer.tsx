import { BRAND } from '@/constants/brand';

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted sm:px-6 lg:px-8">
        © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}
      </div>
    </footer>
  );
}
