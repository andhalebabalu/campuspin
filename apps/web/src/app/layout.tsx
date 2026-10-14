import type { Metadata, Viewport } from 'next';
import { Caveat, Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { SiteChrome } from '@/components/layout/site-chrome';
import { ScrollReveal } from '@/components/motion/scroll-reveal';
import { SpotlightEffects } from '@/components/motion/spotlight-effects';
import { ToastProvider } from '@/components/ui/toast';
import { BRAND } from '@/constants/brand';
import { VisitTracker } from '@/lib/analytics/visit-tracker';
import { SessionProvider } from '@/lib/auth/session-context';
import { env } from '@/lib/env';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});
/** Handwritten notes on the landing page ("Your campus nearby!"). */
const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${BRAND.name}: everything around your college`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
};

export const viewport: Viewport = {
  themeColor: '#0b63cf',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${caveat.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SessionProvider>
          <ToastProvider>
            <VisitTracker />
            <ScrollReveal />
            <SpotlightEffects />
            <SiteChrome>
              <Navbar />
            </SiteChrome>
            {children}
            <SiteChrome>
              <Footer />
            </SiteChrome>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
