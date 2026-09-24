# 05 · Frontend structure and screen list

Answers spec §62 items **6** (frontend folder structure) and **8** (page/screen list).

## 1. Principles

- Next.js **App Router**, React 19, Tailwind v4, TypeScript strict. **No business logic**, no Prisma, no secrets.
- **All network access goes through one client.** `fetch` is banned (ESLint `no-restricted-globals`) inside `features/**` and `components/**`. UI → hooks → `services/*` → `@platform/api-client`.
- Types and validation come from `@platform/contracts`, not re-declared per page.
- Public/SEO pages render on the server (ISR + tag revalidation). Private areas (account, business, admin) are client-rendered behind auth, `noindex`.
- Route guards on the client are **UX only**; the API is always the authority.

## 2. Folder structure

```
apps/web/
├─ public/                        # static assets, placeholders (svg), favicons
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx, not-found.tsx, error.tsx, global-error.tsx, loading.tsx
│  │  ├─ sitemap.ts, robots.ts, opengraph-image.tsx
│  │  ├─ (marketing)/               # /, /for-business, /about, /contact, /help, /terms, /privacy, /community-guidelines, /grievance
│  │  ├─ (public)/
│  │  │  ├─ colleges/               # page.tsx (picker) · [collegeSlug]/page.tsx · [collegeSlug]/[categorySlug]/page.tsx
│  │  │  ├─ places/[placeSlug]/     # page.tsx (+ opengraph-image.tsx)
│  │  │  ├─ cities/[citySlug]/      # Phase 1b
│  │  │  └─ search/
│  │  ├─ (auth)/                    # login, register, register/business, verify-email, forgot-password, reset-password, onboarding/college
│  │  ├─ (account)/account/         # noindex; overview, saved, reviews, contributions, notifications, settings
│  │  ├─ suggest-place/             # noindex; stepper
│  │  ├─ business/                  # noindex; layout with sidebar
│  │  ├─ admin/                     # noindex; layout with sidebar
│  │  └─ api/revalidate/route.ts    # HMAC-verified tag revalidation
│  ├─ components/
│  │  ├─ ui/                        # design-system primitives (Button, Input, Card, Badge, Dialog, Sheet, Tabs, …)
│  │  ├─ layout/                    # Navbar, BottomNav, Footer, DashboardShell, PageHeader
│  │  └─ shared/                    # Logo, Rating, PriceTag, VerifiedBadge, EmptyState, ErrorState, Skeletons
│  ├─ features/                     # one folder per domain; each has components/ hooks/ (and local schemas if UI-only)
│  │  ├─ auth/  colleges/  categories/  places/  discovery/  search/
│  │  ├─ reviews/  reports/  saves/  submissions/  claims/  leads/
│  │  ├─ business/  admin/  notifications/  analytics/
│  ├─ services/                     # API service layer: places.service.ts, colleges.service.ts … (thin wrappers on api-client)
│  ├─ hooks/                        # cross-feature hooks (useDebounce, useMediaQuery, useSelectedCollege, useRequireAuth)
│  ├─ lib/
│  │  ├─ api/                       # client instances: browser + server (server adds cache tags, internal URL)
│  │  ├─ auth/                      # SessionProvider, token store, guards
│  │  ├─ seo/                       # metadata + JSON-LD builders
│  │  ├─ analytics/                 # beacon client (batching)
│  │  ├─ i18n/                      # next-intl setup, message catalogues
│  │  └─ env.ts                     # zod-validated public env
│  ├─ types/                        # web-only types (contract types are imported, not copied)
│  ├─ utils/                        # pure helpers (format, url, image loader)
│  └─ constants/                    # routes, brand.ts (single source of brand name/tagline), limits
└─ tests/                           # Vitest + Testing Library; Playwright e2e
```

## 3. Rendering, data and state

| Page kind | Rendering | Data |
|---|---|---|
| Home | static + ISR (daily) | server-fetched popular colleges; client search |
| College picker | SSG shell + client search | `GET /colleges?q=` debounced |
| College hub | ISR (5 min), tag-revalidated | `/colleges/:slug/discover`; saved-state overlaid client-side |
| Category listing | ISR for the canonical URL; filtered views fetched client-side | filters rendered from `GET /categories/:slug` descriptor; URL is the filter state |
| Place detail | ISR, tag-revalidated | first page of reviews server-rendered, rest client-side |
| Auth, account, business, admin | client-rendered | TanStack Query |

- **Server state:** TanStack Query. **URL state:** filters and pagination live in the query string (shareable, back-button safe). **Session and selected college:** context; selected college also persisted in a cookie (so SSR can personalise) and in `student_profiles` when signed in. **Recent colleges:** localStorage only (privacy).
- **Forms:** react-hook-form + zod schemas from contracts; the server's `error.details[].field` maps back onto fields.
- **Auth:** `SessionProvider` bootstraps with `POST /auth/refresh`; access token in memory; 401 → one silent refresh → retry → sign-out.
- **Analytics:** a small beacon client batches `POST /analytics/events`; no third-party scripts in Phase 1.

## 4. SEO

- `generateMetadata` on every public route; canonical URLs; Open Graph and Twitter cards; generated OG images (`opengraph-image`).
- **JSON-LD:** `EducationalOrganization` (college), `LocalBusiness` subtypes (place), `BreadcrumbList`; `AggregateRating` **only** when review count is genuine and eligible.
- **Sitemap:** chunked (`generateSitemaps`): colleges, college×category pages, places. Excludes `is_demo`, non-`LIVE`, and filtered/paginated URLs. **Robots:** disallow `/account`, `/business`, `/admin`, `/api`, `/suggest-place`, `/search?…`.
- Filtered listing URLs (`?sort=`, `?page=`) carry `noindex,follow` and canonicalise to the base URL.
- Permanently-closed places keep their URL (banner, no lists). Renamed places 301 via `slug_redirects`.
- Keyword note: include **Ahmednagar** as an alias in copy/metadata where natural; many people still search the former name.

## 5. Mandatory states (per route)

Each route folder includes `loading.tsx` (skeleton that matches the layout), `error.tsx` (message + **Retry** + request id), and `not-found.tsx` where relevant. Components implement: **loading → skeleton → empty → error → retry**.

| Situation | Copy / CTA |
|---|---|
| No places near a college | "We haven't discovered any places here yet." → **Suggest a Place** |
| No filter results | "Nothing matches these filters." → **Clear filters** |
| No saved places | "Places you save will show up here." → **Explore your college** |
| Search with no results | "No results for '{q}'." → try broader terms + **Suggest a Place** |
| Network failure | "Couldn't load this. Check your connection." → **Retry** |
| Unauthorised area | redirect to `/login?next=…` (client UX; API enforces) |

## 6. Screen inventory

**Legend:** Idx = indexable by search engines · Ph = phase (1 MVP, 1b late Phase 1, 2, 3, 4).

### 6.1 Public and marketing

| Route | Screen | Idx | Ph |
|---|---|---|---|
| `/` | Home (**built**, `features/landing`): hero with live college/place counts and an illustrated campus map whose pins link into search; campus search (keyword + college picker → `/search?q=&college=`) with quick-category chips; How it works; 12 category tiles (each a leaf category slug → `/search?category=`); map discovery with a real featured place; community + marketplace previews marked *Coming soon* (Phase 2/3, no fake listings); business band with a dashboard mock labelled *Sample preview*; Why us; CTA band. Every fetch fails soft, so the page renders with the API down | ✔ | 1 |
| `/colleges` | College picker: search, popular, recently selected, nearby (opt-in geolocation), cards with logo / city / place count / popular categories | ✔ | 1 |
| `/colleges/[collegeSlug]` | College hub "Everything around {College}": search, category shortcuts, Nearby, Popular, Highly rated, Recently added, Offers, Saved | ✔ | 1 |
| `/colleges/[collegeSlug]/[categorySlug]` | Category listing: search, filters (data-driven), sort, grid/list, distance, price, rating, verified | ✔ | 1 |
| `/places/[placeSlug]` | Place detail: gallery, badges, rating, distance, price, description, amenities, hours + open-now, contact (login-gated), Save, Report, Reviews, **Open in Google Maps**, Claim / Suggest edit. *Reviews delivered in Phase 9: summary with histogram and dimension averages, sortable list with "show more", and a signed-in student's write / edit / withdraw, fetched client-side so changes show at once* | ✔ | 1 |
| `/search` | Global search: grouped results (places, colleges, categories, businesses). **Built so far:** place search with `q`, `category` (leaf slug), `college` (slug), price, verified and sort, all synced to the URL (`searchHref()` in `features/search/lib/search-filters.ts` builds every link into it); an unknown category/college slug shows an inline "not found" instead of an error page | noindex | 1 |
| `/for-business` | Business landing: value, how claiming works, CTA to register | ✔ | 1 |
| `/about`, `/contact`, `/help`, `/terms`, `/privacy`, `/community-guidelines`, `/grievance` | Static + legal (grievance officer contact) | ✔ | 1 |
| `/cities/[citySlug]` | City hub for expansion | ✔ | 1b |
| `/marketplace…` | Student marketplace | ✔ | 2 |
| `/community…` | Groups, events, posts | ✔ | 3 |
| `/sitemap.xml`, `/robots.txt` | Generated | n/a | 1 |
| `404`, `error`, maintenance | Friendly error screens | n/a | 1 |

### 6.2 Authentication

| Route | Screen |
|---|---|
| `/register` | Student registration (name, email, password, college, course, year) |
| `/register/business` | Business-owner registration |
| `/verify-email` | Token landing (success / expired / resend) |
| `/verify-email/sent` | "Check your inbox" with resend and cooldown |
| `/login` | Login (unverified → resend prompt) |
| `/forgot-password`, `/reset-password` | Recovery |
| `/onboarding/college` | Choose college if skipped |

### 6.3 Student (signed in)

| Route | Screen |
|---|---|
| `/account` | Overview |
| `/account/saved` | Saved places |
| `/account/reviews` | My reviews |
| `/account/contributions` | My suggestions and edits with status / feedback |
| `/account/notifications` | Inbox |
| `/account/settings` | Profile, college, password, sessions, delete account |
| `/suggest-place` | Stepper: location (pin-drop / my location / pasted link) → category → details → photos → **duplicate check** → review & submit |
| Dialogs / sheets | Write review · Report · Suggest a correction · Enquire · Sign-in prompt |

### 6.4 Business dashboard: `/business/*` (sidebar per spec §27)

| Route | Screen |
|---|---|
| `/business/onboarding` | Create business profile |
| `/business` | Dashboard: views, leads, saves, reviews, listing statuses, recent activity |
| `/business/listings` | My listings with status chips |
| `/business/listings/new` | Add listing (draft) |
| `/business/listings/[id]` | Edit tabs: Details · Photos · Pricing · Hours · Amenities · Category info · History/status |
| `/business/claims` | Claim listing: search existing places, my claims and outcomes |
| `/business/leads` | Enquiries with status |
| `/business/reviews` | Reviews and reply |
| `/business/analytics` | Simple trends (7/30/90 days) |
| `/business/promotions` | "Coming soon" with waitlist interest capture (honest placeholder, Phase 4) |
| `/business/profile`, `/business/settings` | Business profile, team (1b), notifications |

### 6.5 Admin: `/admin/*` (sidebar per spec §28)

| Route | Screen | Ph |
|---|---|---|
| `/admin` | Dashboard: totals, pending queues, trends, popular colleges/categories/places | 1 |
| `/admin/colleges`, `/new`, `/[id]` | List + editor (map pin, radius, images, verify) | 1 |
| `/admin/categories`, `/[id]` | Tree editor + **attribute builder**, rating dimensions, amenities | 1 |
| `/admin/places`, `/new`, `/[id]` | All statuses; editor; verify / feature / suspend / archive; contributions history | 1 |
| `/admin/businesses`, `/[id]` | Profiles, verification | 1 |
| `/admin/students` | Users list (limited fields for moderators) | 1 |
| `/admin/submissions`, `/[id]` | Queue + review with **side-by-side duplicate comparison** and one-click merge | 1 |
| `/admin/contributions` | Patch review (diff view) | 1 |
| `/admin/claims`, `/[id]` | Claim review with evidence | 1 |
| `/admin/reviews` | Review moderation | 1 |
| `/admin/reports`, `/[id]` | Report triage and resolution | 1 |
| `/admin/imports` | CSV import: upload → dry-run report → commit | 1 |
| `/admin/staff` | Staff and roles (SUPER_ADMIN) | 1 |
| `/admin/settings` | Thresholds, weights, quotas, flags (SUPER_ADMIN) | 1 |
| `/admin/audit-logs` | Search and export | 1 |
| `/admin/offers` | Offer moderation | 1b |
| `/admin/marketplace`, `/admin/community`, `/admin/advertisements` | **Hidden until their phase** (no dead nav) | 2 / 3 / 4 |

Rough total: ~12 public, 8 auth, 7 student (+ dialogs), 12 business, ~22 admin ≈ **60 screens**, each with its four states.

## 7. Portability to React Native

Domain hooks (`usePlaces`, `useReviews`, …) depend only on `services/*` and `@platform/api-client`, with no `window`, `document` or `next/*` imports; URL-bound state (filters) sits behind a small `useFilterState` adapter (query string on web, navigation params on RN). UI primitives share the same prop API (`variant`, `size`, `tone`) and the same tokens, so screens can be rebuilt natively without re-deriving logic.
