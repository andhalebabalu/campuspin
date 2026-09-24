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
  MapDiscoverySection,
} from '@/features/landing/components/discovery-sections';
import { HeroSection } from '@/features/landing/components/hero-section';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: everything around your campus` },
  description: BRAND.description,
};

/**
 * The landing page. Everything on it that looks like data is real (the college picker, the counts,
 * the featured place) and every tile, chip and map pin links into a working search. Each fetch
 * fails soft: if the API is down the page still renders, just without the live bits.
 */
export default async function HomePage() {
  const [colleges, places] = await Promise.all([
    collegesService.list({ sort: 'popular', limit: 50 }).catch(() => null),
    placesService.list({ sort: 'newest', limit: 6 }).catch(() => null),
  ]);

  const collegeOptions = [...(colleges?.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const featured =
    places?.data.find((place) => place.verified) ?? places?.data[0] ?? null;

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
      <MapDiscoverySection featured={featured} />
      <CommunitySection />
      <MarketplaceSection />
      <BusinessSection />
      <WhyUsSection />
      <CtaBand />
    </main>
  );
}
