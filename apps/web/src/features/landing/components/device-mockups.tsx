import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { IconChip } from '@/features/landing/components/primitives';
import type { Tone } from '@/features/landing/lib/landing-content';

/*
 * Pictures of the app, drawn in HTML so they stay sharp at any size. Decorative: the content is
 * sample data showing what the screens look like, hidden from screen readers.
 */

/** A phone: dark bezel, notch, status bar. Width comes from the caller. */
export function PhoneFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[2.2rem] bg-ink-900 p-[0.45rem] shadow-[0_30px_60px_-20px_rgb(4_35_73/0.55)] ring-1 ring-white/10 ${className}`}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[1.8rem] bg-surface">
        <div className="absolute top-1.5 left-1/2 h-4 w-20 -translate-x-1/2 rounded-full bg-ink-900" />
        <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[9px] font-semibold text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-[2px] border border-ink" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

const HOME_TILES: Array<{ label: string; icon: IconName; tone: Tone }> = [
  { label: 'Order Food', icon: 'utensils', tone: 'rose' },
  { label: 'Print', icon: 'printer', tone: 'blue' },
  { label: 'Laundry', icon: 'shirt', tone: 'blue' },
  { label: 'Book Appt.', icon: 'calendar', tone: 'violet' },
  { label: 'Find Room', icon: 'bed', tone: 'rose' },
  { label: 'Study Space', icon: 'book', tone: 'teal' },
  { label: 'Repair', icon: 'wrench', tone: 'green' },
  { label: 'Offers', icon: 'receipt', tone: 'amber' },
];

const TABS: Array<{ label: string; icon: IconName }> = [
  { label: 'Home', icon: 'home' },
  { label: 'Explore', icon: 'search' },
  { label: 'Community', icon: 'users' },
  { label: 'Profile', icon: 'user' },
];

/** The app's home screen, held up in the hero. */
export function HeroPhone({ className = '' }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <div className="flex flex-1 flex-col gap-3 px-3.5 pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset. */}
        <img src="/logo.png" alt="" className="mx-auto h-7 w-auto" />
        <div className="flex items-center gap-2 rounded-full border border-accent-400/60 px-3 py-1.5 text-[9px] text-muted">
          <Icon name="search" className="size-3" />
          Search anything...
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-2">
          <Icon name="pin" className="size-3.5 text-primary-800" />
          <span className="flex flex-1 flex-col leading-tight">
            <span className="text-[9px] font-bold text-ink">Ahilyanagar</span>
            <span className="text-[8px] text-muted">Change City</span>
          </span>
          <span className="text-[8px] text-muted">Change ›</span>
        </div>
        <p className="text-[10px] font-bold text-primary-800">What do you need today?</p>
        <div className="grid grid-cols-4 gap-x-1 gap-y-2.5">
          {HOME_TILES.map((tile) => (
            <span key={tile.label} className="flex flex-col items-center gap-1 text-center">
              <IconChip icon={tile.icon} tone={tile.tone} size="sm" className="!rounded-lg" />
              <span className="text-[7px] leading-tight text-body">{tile.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 border-t border-line px-2 py-2">
        {TABS.map((tab, index) => (
          <span
            key={tab.label}
            className={`flex flex-col items-center gap-0.5 text-[7px] ${index === 0 ? 'font-bold text-primary-800' : 'text-muted'}`}
          >
            <Icon name={tab.icon} className="size-3.5" />
            {tab.label}
          </span>
        ))}
      </div>
    </PhoneFrame>
  );
}

/** A café's menu page with table ordering. */
export function CafePhone({ className = '' }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-ink">
        <Icon name="chevronLeft" className="size-3" /> Desi Menu
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- local stock photo. */}
      <img src="/images/amenities/mess.jpg" alt="" className="mx-3 h-28 rounded-xl object-cover" />
      <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3">
        <span className="flex flex-col">
          <span className="text-[11px] font-bold text-ink">{BRAND.name} Café</span>
          <span className="text-[8px] text-muted">Table 07</span>
        </span>
        <span className="rounded-md bg-accent-600 py-1.5 text-center text-[9px] font-semibold text-white">
          Order Food
        </span>
        <div className="grid grid-cols-2 gap-1.5 text-[7px] text-body">
          {['Request Water', 'Request Cleaning', 'Request Bill', 'Review'].map((item) => (
            <span key={item} className="rounded border border-line px-1.5 py-1">
              {item}
            </span>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

const MENU = [
  { dish: 'Paneer Butter Masala', price: '₹120', tone: 'bg-amber-600' },
  { dish: 'Dal Fry', price: '₹80', tone: 'bg-amber-600' },
  { dish: 'Tandoori Roti', price: '₹15', tone: 'bg-rose-600' },
  { dish: 'Rice', price: '₹40', tone: 'bg-amber-600' },
  { dish: 'Salad', price: '₹30', tone: 'bg-accent-400' },
];

/** Today's menu at a mess. */
export function MessMenuPhone({ className = '' }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-1.5 pb-3">
        <span className="flex items-center justify-between text-[11px] font-bold text-ink">
          Mess Menu <Icon name="clock" className="size-3 text-muted" />
        </span>
        <span className="text-[9px] font-semibold text-primary-800">Today&rsquo;s Menu</span>
        <ul className="flex flex-col gap-1.5">
          {MENU.map((item) => (
            <li
              key={item.dish}
              className="flex items-center gap-2 rounded-lg bg-subtle px-2 py-1.5 text-[8px]"
            >
              <span className={`size-2 rounded-full ${item.tone}`} />
              <span className="flex-1 font-medium text-ink">{item.dish}</span>
              <span className="text-muted">{item.price}</span>
            </li>
          ))}
        </ul>
        <span className="mt-auto rounded-full bg-accent-600 py-1.5 text-center text-[9px] font-semibold text-white">
          View Menu
        </span>
      </div>
    </PhoneFrame>
  );
}

const NEARBY: Array<{ label: string; distance: string; icon: IconName; tone: Tone }> = [
  { label: 'Mess', distance: '200 m', icon: 'utensils', tone: 'amber' },
  { label: 'Rooms', distance: '300 m', icon: 'bed', tone: 'violet' },
  { label: 'Libraries', distance: '400 m', icon: 'book', tone: 'blue' },
  { label: 'Xerox', distance: '500 m', icon: 'printer', tone: 'violet' },
  { label: 'Food', distance: '200 m', icon: 'coffee', tone: 'amber' },
  { label: 'Laundry', distance: '400 m', icon: 'shirt', tone: 'blue' },
  { label: 'Repair', distance: '600 m', icon: 'wrench', tone: 'rose' },
];

/** Places near the college with their distance. */
export function NearbyPhone({ className = '' }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pt-1.5 pb-3">
        <span className="text-[11px] font-bold text-ink">Nearby Services</span>
        <ul className="flex flex-col gap-1">
          {NEARBY.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-2 border-b border-line py-1 text-[8px] last:border-0"
            >
              <IconChip icon={item.icon} tone={item.tone} size="sm" className="!size-5 !rounded" />
              <span className="flex-1 font-medium text-ink">{item.label}</span>
              <span className="text-muted">{item.distance}</span>
            </li>
          ))}
        </ul>
      </div>
    </PhoneFrame>
  );
}

const RECENT_ORDERS: Array<{
  title: string;
  sub: string;
  time: string;
  icon: IconName;
  tone: Tone;
}> = [
  { title: 'Table 07', sub: 'Order Food', time: '12:45 PM', icon: 'utensils', tone: 'rose' },
  { title: 'Order Food', sub: 'Order Food', time: '11:32 AM', icon: 'cart', tone: 'violet' },
  { title: 'Bill Requested', sub: 'Table 03', time: '10:18 PM', icon: 'receipt', tone: 'amber' },
];

/** The business dashboard on a laptop, with the recent-orders card floating beside it. */
export function LaptopDashboard({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`relative ${className}`}>
      <div className="rounded-t-xl border-[6px] border-b-0 border-ink-800 bg-surface shadow-xl">
        <div className="flex items-center gap-2 bg-primary-800 px-3 py-1.5 text-[8px] font-bold text-white">
          <Icon name="store" className="size-3" /> {BRAND.name} Business
        </div>
        <div className="grid grid-cols-[52px_1fr]">
          <ul className="flex flex-col gap-1 border-r border-line p-1.5 text-[6px] text-body">
            {['Dashboard', 'Orders', 'Menu', 'Invoices', 'Reviews'].map((item, index) => (
              <li
                key={item}
                className={`rounded px-1 py-0.5 ${index === 0 ? 'bg-primary-50 font-bold text-primary-800' : ''}`}
              >
                {item}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 p-2">
            <div className="grid w-[62%] grid-cols-2 gap-2">
              {[
                ['Total Orders', '248'],
                ['Today’s Revenue', '₹5,680'],
              ].map(([label, value]) => (
                <span key={label} className="rounded-md border border-line p-1.5">
                  <span className="block text-[6px] text-muted">{label}</span>
                  <span className="text-sm font-extrabold text-primary-800">{value}</span>
                </span>
              ))}
            </div>
            <svg viewBox="0 0 200 60" className="h-14 w-full">
              <defs>
                <linearGradient id="laptop-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--color-primary-400)" stopOpacity="0.35" />
                  <stop offset="1" stopColor="var(--color-primary-400)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 50 L25 42 L50 46 L75 30 L100 34 L125 22 L150 26 L175 12 L200 16 L200 60 L0 60Z"
                fill="url(#laptop-area)"
              />
              <path
                d="M0 50 L25 42 L50 46 L75 30 L100 34 L125 22 L150 26 L175 12 L200 16"
                className="fill-none stroke-primary-600"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>
      <div className="mx-[-6%] h-2.5 rounded-b-lg bg-linear-to-b from-neutral-300 to-neutral-400" />

      <div className="absolute -top-10 -right-6 w-[44%] rounded-xl border border-line bg-surface p-2.5 shadow-lg sm:-right-12">
        <p className="mb-1.5 text-[9px] font-bold text-ink">Recent Orders</p>
        <ul className="flex flex-col gap-1.5">
          {RECENT_ORDERS.map((order) => (
            <li key={order.title + order.time} className="flex items-center gap-1.5">
              <IconChip
                icon={order.icon}
                tone={order.tone}
                size="sm"
                className="!size-5 !rounded"
              />
              <span className="flex flex-1 flex-col leading-tight">
                <span className="text-[8px] font-semibold text-ink">{order.title}</span>
                <span className="text-[7px] text-muted">{order.sub}</span>
              </span>
              <span className="text-[7px] text-muted">{order.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
