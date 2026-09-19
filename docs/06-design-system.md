# 06 · Design system

Answers spec §62 item **7** and spec §20–22, §29, §44–45, §48–49.

**Intent:** a premium, calm, trustworthy consumer product, closer to a modern marketplace than an admin template. Five hues only (cobalt, ink/slate, amber, green, red). Generous white space, real type hierarchy, one accent, restrained shadows and motion. Never a government-portal or Bootstrap look.

All contrast figures below were **computed** (WCAG relative luminance), not estimated. A token test (added with the design-system phase) will assert them in CI so the palette cannot regress. The tokens already live in `apps/web/src/app/globals.css`.

## 1. Colour

### Brand palette (raw)

| Role | Token | Hex | Use |
|---|---|---|---|
| **Primary: cobalt** | `primary-50` | `#EEF3FF` | tinted backgrounds |
| | `primary-100` | `#DDE7FF` | hover tint |
| | `primary-200` | `#C0D0FF` | |
| | `primary-300` | `#96B0FF` | accents on dark |
| | `primary-400` | `#6486FF` | |
| | `primary-500` | `#3D63F5` | focus ring |
| | **`primary-600`** | **`#2B4BDE`** | **buttons, links** |
| | `primary-700` | `#2238B0` | hover / pressed |
| | `primary-800` | `#1F318C` | |
| | `primary-900` | `#1E2D6E` | |
| **Secondary: ink** | `ink-900` | `#0B1220` | headings, hero/footer surfaces |
| | `ink-800` | `#111B30` | dark surface raised |
| | `ink-700` | `#1B2842` | dark borders |
| **Accent: amber** | `accent-50` | `#FFF7E6` | offer/featured tint |
| | `accent-400` | `#FFB020` | offers, featured, star fill |
| | `accent-700` | `#92400E` | text on amber tint |
| **Neutral: cool slate** | `neutral-0` | `#FFFFFF` | |
| | `neutral-25` / `50` | `#FAFBFC` / `#F4F6F9` | page / subtle surface |
| | `neutral-100` / `200` | `#EBEEF3` / `#DDE2EA` | dividers, card borders |
| | `neutral-300` | `#C4CBD8` | decorative borders |
| | `neutral-400` | `#9AA3B5` | disabled, decorative icons |
| | `neutral-500` | `#6B7589` | muted text (white surfaces only) |
| | `neutral-600` | `#4F586B` | secondary text |
| | `neutral-700` | `#3A4255` | body text alt |
| | `neutral-800` | `#232A3B` | |
| Success | `success-50` / `600` / `700` | `#E8F7F0` / `#12805C` / `#0F6B4B` | Verified, open |
| Danger | `danger-50` / `600` / `700` | `#FEF1F0` / `#D92D20` / `#B42318` | errors, destructive |
| Warning | reuses amber (`accent-50` / `accent-700`) | | pending, caution |
| Info | reuses primary | | keeps the palette tight |
| **Control border** | `border-control` | `#7C8598` | input/checkbox boundaries (3:1 rule) |

### Semantic tokens (components use **only these**)

`bg-canvas` (neutral-25) · `bg-surface` (white) · `bg-subtle` (neutral-50) · `bg-inverse` (ink-900) · `text-primary` (ink-900) · `text-secondary` (neutral-600) · `text-muted` (neutral-500, white surfaces only) · `text-inverse` (white) · `border-subtle` (neutral-200) · `border-control` · `action-primary` (primary-600) · `action-primary-hover` (primary-700) · `focus-ring` (primary-500) · `status-success / warning / danger` · `accent`.

Semantic indirection is what makes rebranding (the name and colours may change) and later dark mode a token swap, not a rewrite. Dark mode is Phase 2; tokens are structured for it now.

### Verified contrast (computed)

| Pair | Ratio | Verdict |
|---|---|---|
| ink-900 on white | 18.72 | AAA |
| neutral-700 on white | 10.05 | AAA |
| neutral-600 on white / on neutral-50 / on neutral-100 | 7.14 / 6.60 / 6.14 | AAA / AA / AA |
| **neutral-500 on white** | 4.63 | AA, **white surfaces only** |
| **neutral-500 on neutral-50** | **4.28** | **fails AA, so muted text on tinted surfaces must use neutral-600** |
| white on primary-600 | 6.64 | AA (buttons) |
| primary-700 on primary-50 | 8.36 | AAA |
| ink-900 on accent-400 | 10.24 | AAA (amber buttons use dark text) |
| accent-700 on accent-50 | 6.65 | AA |
| success-700 on success-50 · white on success-600 | 5.89 · 4.92 | AA |
| danger-700 on danger-50 · white on danger-600 | 5.97 · 4.83 | AA |
| on ink-900: white / neutral-300 / neutral-400 / primary-300 | 18.72 / 11.48 / 7.38 / 8.87 | AA+ |
| focus ring primary-500 on white | 4.88 | ≥ 3:1 required |
| **control border `#7C8598` on white / on neutral-50** | 3.71 / 3.42 | meets 3:1 non-text |
| neutral-300 border on white | 1.63 | **decorative only**, never the sole boundary of an input |
| amber-400 star fill on white | ~2.15 | decorative; the numeric rating is always shown as text |

**Rules:** never rely on colour alone (open/closed = text + icon; verified = icon + label); no more than one accent per view; gradients only as a single subtle tint in the hero, never on cards or buttons.

## 2. Typography

| Use | Family | Weights |
|---|---|---|
| Headings, display | **Plus Jakarta Sans** | 600 / 700 / 800 |
| UI and body | **Inter** | 400 / 500 / 600 |
| Devanagari (when Marathi/Hindi is enabled) | Noto Sans Devanagari | 400 / 600 |

Self-hosted via `next/font` (`display: swap`, Latin subset). Prices and numbers use `font-variant-numeric: tabular-nums`.

| Token | Mobile → Desktop (px / line-height) | Use |
|---|---|---|
| `display` | 40/44 → 60/64, −2 % tracking | hero only |
| `h1` | 30/38 → 40/48 | page titles |
| `h2` | 24/32 → 30/38 | sections |
| `h3` | 20/28 | cards, panels |
| `h4` | 18/26 | |
| `body-lg` | 18/28 | intro copy |
| `body` | **16/24** | default (never < 16 for form inputs; avoids iOS zoom) |
| `body-sm` | 14/20 | secondary |
| `caption` | 12/16 | non-essential metadata only; never actions or prices |

Reading width ≤ 68ch. No text below 12px anywhere.

## 3. Spacing, layout, radius, elevation, motion

| Aspect | Spec |
|---|---|
| Spacing | 4 px base: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 |
| Gutters | 16 (mobile) · 24 (tablet) · 32 (desktop); container max **1200** |
| Breakpoints | `xs` 360 (design minimum) · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 |
| Radius | `sm` 6 · `md` 10 · `lg` 14 · `xl` 20 · `full`. Buttons/inputs 10, cards 14, dialogs/sheets 20, chips and avatars full. **Not everything is a pill.** |
| Elevation | `xs` `0 1px 2px rgb(11 18 32/.06)` · `sm` `0 1px 3px rgb(11 18 32/.08), 0 1px 2px rgb(11 18 32/.04)` · `md` `0 6px 16px -4px rgb(11 18 32/.10), 0 2px 6px -2px rgb(11 18 32/.06)` · `lg` `0 16px 40px -12px rgb(11 18 32/.18)` · focus `0 0 0 3px rgb(61 99 245/.35)` |
| Cards | 1 px `border-subtle` + `xs`; hover: `md`, −2 px translate, border → neutral-300 |
| z-index | base 0 · sticky 10 · dropdown 20 · overlay 30 · modal 40 · toast 50 |
| Motion | durations 120 (micro) · 200 (default) · 320 (sheets/dialogs) · 500 (hero entrance only). Easing standard `cubic-bezier(.2,0,0,1)`, emphasised `cubic-bezier(.2,.8,.2,1)`. **Animate only `transform` and `opacity`.** Skeleton shimmer 1.4 s. Page transition: 200 ms fade + 8 px rise via View Transitions where supported, otherwise none. `prefers-reduced-motion` disables all non-essential motion. No scroll-jacking, no parallax, no looping decoration beyond the hero float (≤ 8 px). |

## 4. Component specification

Built on Radix primitives + `class-variance-authority` + `tailwind-merge`; every component consumes semantic tokens only. All interactive targets ≥ **44×44 px** on touch.

| Component | Variants / sizes | States | Notes |
|---|---|---|---|
| **Button** | `primary` · `secondary` (outline) · `ghost` · `danger` · `accent` (offers only); `sm` 36 / `md` 44 / `lg` 52 | default, hover, pressed, focus-visible, disabled, **loading** (spinner, width preserved) | Icon-leading/trailing; never two primaries per view |
| **IconButton** | `md` 44, `sm` 36 | as above | Requires `aria-label` |
| **Input / Textarea / Select / Combobox** | `md` 44 | default, focus, error, disabled, readonly | Label always visible, helper + error text, `aria-describedby`, 16 px text |
| **Checkbox / Radio / Switch** | | checked, indeterminate, disabled, error | 24 px hit area minimum drawn inside 44 px target |
| **Chip** (filter/choice) | selected / unselected, with count | | Horizontally scrollable on mobile |
| **Badge** | `verified` (green + check), `owner-claimed`, `open` / `closed`, `featured` (amber), `pending`, `demo`, count | | Icon + text, never colour only |
| **Card** | `PlaceCard` (grid / list / compact), `CollegeCard`, `CategoryTile`, `StatCard`, `OfferCard` | default, hover, loading skeleton | 4:3 image with fixed aspect (no layout shift), 1–2 lines of name, one meta row; ≤ 3 highlight chips |
| **Rating** | display (stars + number + count) and input (5-star, keyboard) | | Number is text; stars decorative |
| **PriceTag** | `from ₹3,000 / month`, range | unknown → "Price on request" | Uses `tabular-nums` |
| **Tabs / SegmentedControl** | underline / pill | | Arrow-key navigation; used for grid/list toggle |
| **Dialog** | desktop centred; **mobile → bottom Sheet** | enter/exit 320 ms | Focus trap, ESC, return focus, scroll lock |
| **Sheet / Drawer** | bottom (mobile filters), side (desktop panels) | | |
| **Dropdown / Popover / Tooltip** | | | Radix; collision-aware |
| **Toast** | success, error, info | | `role=status`; never the only feedback for errors |
| **Navbar** | desktop: logo · college switcher · search · Suggest · account. Mobile: compact top bar + **bottom tab bar** (Home, Search, Saved, Account) | | Sticky, elevation appears on scroll |
| **Sidebar** (dashboards) | collapsible, icon + label, active indicator | | Becomes drawer < `lg` |
| **FilterBar** | chips + "Filters" button; desktop left rail 280 px; mobile bottom sheet with Apply/Clear | | Rendered from the API filter descriptor |
| **Gallery / Lightbox** | grid preview + swipeable lightbox | | Keyboard nav, alt text, lazy-loaded, 200 ms transition |
| **Stepper** | Suggest-a-Place | | Saves progress locally; back-safe |
| **MapPicker** | pin-drop, "use my location", paste-link | | MapLibre, lazy-loaded (only on this step) |
| **FileUploader** | drag/drop + camera, progress, remove | | Client pre-checks type/size; server is authoritative |
| **DataTable** (admin) | sort, filter, bulk actions, column toggle | loading rows, empty, error | Used where tabular; **not** every admin screen |
| **Skeleton** | matches the real layout | | Never a page-level spinner |
| **EmptyState / ErrorState** | icon + headline + one-line reason + primary CTA (+ Retry, request id) | | Copy in [05 §5](05-frontend.md#5-mandatory-states-per-route) |

## 5. Key screen wireframes (structure, not final visuals)

**Home hero:** the ecosystem is shown as a **node graph**, the LINK metaphor. A college node sits at the centre with category nodes (bed, utensils, book, dumbbell, shirt, pill, bike, printer…) connected by thin lines. It is pure SVG/CSS (no heavy image), with a gentle ≤ 8 px float that is disabled for reduced motion.

```
┌───────────────────────────────────────────────────────────────┐
│ LINK   Colleges  For business             Suggest   Sign in   │
├───────────────────────────────────────────────────────────────┤
│  Everything You Need                 ┌─ ecosystem graph ────┐ │
│  Around Your College.                │   ○bed   ○mess       │ │
│  Discover rooms, PGs, messes,        │ ○gym  ◉COLLEGE ○lib  │ │
│  libraries, gyms, services and       │   ○laundry ○xerox    │ │
│  more, all in one place.             └──────────────────────┘ │
│  [ Explore Your College ]  [ List Your Business ]             │
│                                                               │
│  College ──▶ Discover ──▶ Connect ──▶ Explore                 │
├───────────────────────────────────────────────────────────────┤
│  Search your college […………………………]   Popular colleges  ▸       │
│  [CollegeCard][CollegeCard][CollegeCard]                       │
└───────────────────────────────────────────────────────────────┘
```

**College hub / listing (desktop):**

```
┌ Everything around New Arts, Commerce & Science College ───────┐
│ [ Search places, categories…                     ]            │
│ (bed)(mess)(lib)(gym)(laundry)(medical)(xerox)(more)           │
├──────────────┬────────────────────────────────────────────────┤
│ Filters      │ 42 messes near you        Sort: Nearest ▾  ▦ ≡ │
│ Distance     │ ┌────────┐ ┌────────┐ ┌────────┐               │
│ Price        │ │ image  │ │ image  │ │ image  │               │
│ Rating       │ │Name ✓  │ │Name    │ │Name ✓  │               │
│ Verified     │ │★4.4·850m│ │★4.1·1.2km│ │★4.6·2km│            │
│ Veg / Non-veg│ │₹3,000/mo│ │₹2,800/mo│ │₹3,400/mo│             │
│ (data-driven)│ └────────┘ └────────┘ └────────┘               │
│              │ Missing a place? [ + Suggest a Place ]          │
└──────────────┴────────────────────────────────────────────────┘
```

**Place detail (desktop; mobile has a sticky bottom bar: Call · Directions):**

```
┌ ‹ Back ─────────────────────────────────────────── ♡ Save  ⚑ ┐
│ ┌──────────────── gallery (1 large + 4 grid) ───────────────┐ │
│ ABC Mess  ✓ Verified · ★ 4.4 (37) · 850 m · ≈ 11 min walk     │
│ ┌ Description / amenities / hours (Open now · closes 3 pm) ┐  ┌ Action card (sticky) ┐
│ │ Category info (diet, meals…) · Reviews · Report          │  │ ₹3,000 / month       │
│ └──────────────────────────────────────────────────────────┘  │ [ Open in Google Maps ]│
│ Is this your business? Claim this listing.                     │ [ Call ] [ Enquire ]  │
│                                                                └───────────────────────┘
└───────────────────────────────────────────────────────────────┘
```

The **Open in Google Maps** action is the most prominent control on the page. It builds `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` (no API key required), which the phone opens in the Maps app.

## 6. Accessibility standard (WCAG 2.2 AA)

Semantic landmarks and heading order · skip link · visible `:focus-visible` ring on every interactive element · full keyboard operability (dialogs trap and restore focus; menus and tabs use arrow keys) · form errors linked with `aria-describedby` and announced · toasts `role=status` · gallery images always have alt text (fallback "{place} — photo {n}") · ratings and statuses have text equivalents · language attribute set · touch targets ≥ 44 px · `prefers-reduced-motion` respected · automated axe checks in Playwright on key pages.

## 7. Portability

Tokens are plain CSS variables today (Tailwind `@theme`). When the mobile app starts they move into a shared `@platform/design-tokens` package that feeds both the Tailwind theme and NativeWind/StyleSheet. Component props (`variant`, `size`, `tone`) are the same across platforms, so the React Native app looks and behaves like the web product.

## 8. Brand handling

The name, tagline and logo come from one `brand.ts` config plus a `Logo` component, so a rename touches one file. Working name **LINK**; tagline "Connecting Students with Everything Around Them." Photography: no stock images of real businesses; seed content uses neutral illustrated placeholders and is labelled as demo ([09](09-env-and-seed.md)).
