import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import {
  ComingSoonBadge,
  Container,
  CTA_CLASSES,
  IconChip,
  SectionHeading,
} from '@/features/landing/components/primitives';
import {
  COMMUNITY_FEATURES,
  MARKETPLACE_KINDS,
  TONES,
  type Tone,
} from '@/features/landing/lib/landing-content';

const PEOPLE: Array<{ initials: string; tone: Tone; x: number; y: number; size: string }> = [
  { initials: 'AK', tone: 'blue', x: 22, y: 58, size: 'size-20 text-xl' },
  { initials: 'PS', tone: 'rose', x: 44, y: 66, size: 'size-24 text-2xl' },
  { initials: 'RV', tone: 'green', x: 66, y: 58, size: 'size-20 text-xl' },
  { initials: 'MN', tone: 'violet', x: 84, y: 70, size: 'size-16 text-lg' },
];

const BUBBLES: Array<{ icon: 'chat' | 'users' | 'calendar' | 'search' | 'chats'; x: number; y: number }> = [
  { icon: 'chat', x: 12, y: 24 },
  { icon: 'users', x: 34, y: 14 },
  { icon: 'chats', x: 58, y: 18 },
  { icon: 'calendar', x: 80, y: 26 },
  { icon: 'search', x: 92, y: 46 },
];

/** Students + chat bubbles, drawn with initials and icons instead of a stock photo. */
function CommunityIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] bg-linear-to-br from-primary-50 to-accent-50"
    >
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-accent-400/15" />
      {BUBBLES.map((bubble, index) => (
        <span
          key={bubble.icon}
          className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 animate-float items-center justify-center rounded-full bg-surface text-primary-600 shadow-md ring-1 ring-line"
          style={{ left: `${bubble.x}%`, top: `${bubble.y}%`, animationDelay: `${index * -1.2}s` }}
        >
          <Icon name={bubble.icon} />
        </span>
      ))}
      {PEOPLE.map((person) => (
        <span
          key={person.initials}
          className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-display font-extrabold shadow-lg ring-4 ring-surface ${person.size} ${TONES[person.tone]}`}
          style={{ left: `${person.x}%`, top: `${person.y}%` }}
        >
          {person.initials}
        </span>
      ))}
    </div>
  );
}

export function CommunitySection() {
  return (
    <section
      id="features"
      aria-labelledby="community-title"
      className="scroll-mt-20 border-y border-line bg-surface py-20"
    >
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <CommunityIllustration />
        <div className="flex flex-col gap-8">
          <SectionHeading
            id="community-title"
            eyebrow="Student community"
            title={
              <>
                More than places.
                <br />
                It&rsquo;s your campus community.
              </>
            }
            lead="Connect with students, discover opportunities and make campus life easier. These are on our roadmap, and you can already help by suggesting the places you know."
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {COMMUNITY_FEATURES.map((feature) => (
              <li
                key={feature.label}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <IconChip icon={feature.icon} tone={feature.tone} size="sm" />
                <span className="flex-1 text-sm font-semibold text-primary-800">
                  {feature.label}
                </span>
                <ComingSoonBadge />
              </li>
            ))}
          </ul>
          <Link href={ROUTES.suggestPlace} className={`${CTA_CLASSES} w-fit`}>
            Suggest a place
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

export function MarketplaceSection() {
  return (
    <section aria-labelledby="marketplace-title" className="py-20">
      <Container className="grid items-center gap-10 lg:grid-cols-[0.8fr_2fr]">
        <div className="flex flex-col gap-5">
          <SectionHeading
            id="marketplace-title"
            eyebrow="Marketplace"
            title="Buy. Sell. Share."
            lead="Soon: great deals from your fellow students, right next to campus."
          />
          <ComingSoonBadge />
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {MARKETPLACE_KINDS.map((kind) => (
            <li
              key={kind.label}
              className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs"
            >
              <div className={`flex aspect-square items-center justify-center ${TONES[kind.tone]}`}>
                <Icon name={kind.icon} className="size-12" />
              </div>
              <div className="flex flex-col gap-1 p-3">
                <span className="text-sm font-bold text-primary-800">{kind.label}</span>
                <span className="text-xs text-muted">Listings coming soon</span>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
