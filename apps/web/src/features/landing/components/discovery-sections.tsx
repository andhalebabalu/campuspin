import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import {
  Container,
  IconChip,
  SectionHeading,
  stagger,
} from '@/features/landing/components/primitives';
import { CATEGORY_TILES, HOW_IT_WORKS } from '@/features/landing/lib/landing-content';
import { searchHref } from '@/features/search/lib/search-filters';

export function HowItWorksSection() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 py-20">
      <Container className="grid gap-10 lg:grid-cols-[0.8fr_2fr] lg:items-center">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title={`Your campus. One platform.`}
          lead={`From finding a room to your daily mess and printing shop, ${BRAND.name} makes campus life simpler, faster and better.`}
        />

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              data-reveal
              style={stagger(index, 100)}
              className="relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs"
            >
              <IconChip icon={step.icon} tone={step.tone} />
              <span className="font-display text-sm font-bold text-accent-600">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-base font-bold text-primary-800">{step.title}</h3>
              <p className="text-sm leading-relaxed text-body">{step.body}</p>
              {index < HOW_IT_WORKS.length - 1 && (
                <Icon
                  name="arrowRight"
                  className="absolute top-8 -right-3.5 hidden size-4 text-neutral-400 lg:block"
                />
              )}
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function CategoryGridSection() {
  return (
    <section
      id="categories"
      aria-labelledby="categories-title"
      className="scroll-mt-20 border-y border-line bg-surface py-20"
    >
      <Container className="flex flex-col gap-10">
        <SectionHeading
          id="categories-title"
          eyebrow="Categories"
          title="Explore everything around you"
        />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORY_TILES.map((tile, index) => (
            <li key={tile.label} data-reveal style={stagger(index % 6, 60)}>
              <Link
                href={searchHref({ category: tile.slug ?? '' })}
                className="group flex h-full flex-col items-center gap-3 rounded-xl border border-line bg-surface px-3 py-6 text-center transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
              >
                <IconChip
                  icon={tile.icon}
                  tone={tile.tone}
                  size="lg"
                  className="!rounded-full transition-transform group-hover:scale-110"
                />
                <span className="text-sm font-bold text-primary-800">{tile.label}</span>
                <span className="text-xs leading-snug text-muted">{tile.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
