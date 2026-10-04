import type { Metadata } from 'next';
import { BRAND } from '@/constants/brand';
import {
  BusinessSection,
  CtaBand,
  WhyUsSection,
} from '@/features/landing/components/closing-sections';
import {
  CommunitySection,
  MarketplaceSection,
} from '@/features/landing/components/community-sections';
import {
  CategoryGridSection,
  HowItWorksSection,
} from '@/features/landing/components/discovery-sections';
import { HeroSection } from '@/features/landing/components/hero-section';
import {
  DailyServicesSection,
  LatestPlacesSection,
} from '@/features/landing/components/services-sections';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: everything around your campus` },
  description: BRAND.description,
};

/**
 * The landing page. Everything on it that looks like data is real (the college picker, the counts,
 * the newest places) and every tile, chip and map pin links into a working page or search. Each fetch
 * fails soft: if the API is down the page still renders, just without the live bits.
 */
export default async function HomePage() {
  const [colleges, places] = await Promise.all([
    collegesService.list({ sort: 'popular', limit: 50 }).catch(() => null),
    placesService.list({ sort: 'newest', limit: 8 }).catch(() => null),
  ]);

  const collegeOptions = [...(colleges?.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="flex-1">
      <HeroSection
        colleges={collegeOptions}
        stats={{
          colleges: colleges ? (colleges.meta?.total ?? colleges.data.length) : null,
          places: places ? (places.meta?.total ?? places.data.length) : null,
        }}
      />
      <HowItWorksSection />
      <CategoryGridSection />
      <LatestPlacesSection places={places?.data ?? []} />
      <DailyServicesSection />
      <CommunitySection />
      <MarketplaceSection />
      <BusinessSection />
      <WhyUsSection />
      <CtaBand />
    </main>
  );
}
