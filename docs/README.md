# Student Ecosystem Platform: architecture and implementation docs

> Working brand: **LINK** ("Local Information & Network for Knowledge"). The name is configuration, never architecture: neutral `@platform/*` package scope, one `brand.ts`.

**Status:** implementation in progress, phase by phase (see [08-roadmap](08-roadmap.md)). The repository root [README](../README.md) has setup instructions.
**Launch market:** Ahilyanagar, Maharashtra (formerly Ahmednagar)

## Documents

| # | Document | Spec §62 item |
|---|---|---|
| 01 | [Requirements analysis, decisions and risks](01-analysis-and-risks.md) | 1, 2 |
| 02 | [Architecture](02-architecture.md) (system, modules, auth, search, duplicates, security, scaling, web + mobile) | 3, 5, 13, 14 |
| 03 | [Database design and ERD](03-database.md) | 4 |
| 04 | [API specification](04-api-spec.md) | 5 |
| 05 | [Frontend structure and screen list](05-frontend.md) | 6, 8 |
| 06 | [Design system](06-design-system.md) | 7 |
| 07 | [Roles and permission matrix](07-rbac.md) | 9 |
| 08 | [Roadmap, testing and quality gate](08-roadmap.md) | 10 |
| 09 | [Environment variables and seed strategy](09-env-and-seed.md) | 11, 12 |

## The ten decisions that shape everything

1. **Modular monolith**: NestJS + MySQL + Prisma. Next.js is a pure API consumer; all business rules live server-side so web and mobile can never disagree.
2. **One contract package** (`@platform/contracts`, zod) is the single source of truth for validation and types across API, web and the future mobile app. NestJS 12's built-in `StandardSchemaValidationPipe` validates requests from those schemas and Swagger documents them from the same schemas, so validation and docs cannot drift.
3. **Central `places`** + fully dynamic categories with typed, admin-defined attributes, price options and multi-slot hours. No per-category tables, no hard-coded categories in the UI.
4. **Distance is derived, then precomputed** into `college_places` (many-to-many college↔place). Coordinates stay the only source of truth, and "nearest" becomes an indexed read.
5. **Data lives in `places`; workflow lives in `place_submissions`.** Edits to live places go through `place_contributions` patches, so owners cannot bypass moderation and students can still correct data.
6. **Duplicate detection is layered** (geo + IDF-weighted name similarity with Indic-aware normalisation + category + phone), runs at suggest time **and** again server-side, and includes pending suggestions, so 100 students suggesting "ABC Mess" produce one review item.
7. **Auth:** 15-minute JWT + rotating opaque refresh tokens (httpOnly cookie on web, body on mobile), reuse detection, phone-OTP-ready by design.
8. **MySQL outbox** for email/push/webhooks: reliable and multi-instance-safe with **no Redis** in the MVP. In-process domain events are the seam for future service extraction.
9. **Search behind a `SearchProvider`**: MySQL FULLTEXT + prefix now, OpenSearch later, with explicit switch-over triggers.
10. **Marketplace and community are not built, but not blocked**: reports, media, categories (`scope`), notifications and moderation are already generic.

## Decisions made since the first draft

| Topic | Decision | Made by |
|---|---|---|
| Local database | **XAMPP** (Apache + MySQL). The "MySQL" module in XAMPP is **MariaDB 10.4.32** on this machine; see [risk T13](01-analysis-and-risks.md#5-technical-risks). Database name `link_platform`. | you |
| Ports | API `3001`, web `3000`. API base `http://localhost:3001/api/v1` | you |
| Build order | Backend-first, 23 phases ([08](08-roadmap.md)). Replaces my earlier "UI slice right after the discovery API" suggestion (D14 withdrawn). | you |
| Health endpoint | `GET /api/v1/health` → `{ success, data: { status: "ok" }, message: "API is running" }` | you |
| Error `details` | An object (`{ fields: { email: ["…"] } }` for validation), not an array | you |
| Validation library (D13) | zod via NestJS 12 Standard Schema (no `nestjs-zod`, which does not yet support Nest 12) | verified during Phase 1 |
| Env files | Per-app: `apps/api/.env`, `apps/web/.env.local` (the web app never sees database credentials) | me |
| Packages | `packages/contracts` (types + schemas) and `packages/api-client`. `design-tokens` and `config` packages are deferred until the mobile app or a second consumer exists. | me |
| Commits | Meaningful commits after each phase; `.env` and secrets are never committed | you |
| Database schema | 32 tables: your Phase 2 entity list plus the support tables the design needs. `User` carries `collegeId`/`course`/`year` and `emailVerifiedAt`; `UserStatus` is `ACTIVE`/`SUSPENDED`/`DEACTIVATED`; student suggestions live in `place_submissions`; both `review_reports` and the generic `reports` exist. Full list of differences from the first design: [03 §0](03-database.md#0-implemented-schema-phase-2-read-this-first) | you (brief) |
| Prisma datasource | `url` cannot be set inside `schema.prisma` in Prisma 7 (validation error P1012); it is read from `DATABASE_URL` by `prisma.config.ts` | verified in Phase 2 |
| Database tests | Run against the real `link_platform` inside transactions that are always rolled back, so no second database is needed | you (no second DB) |
| Prisma Studio | Does not work on XAMPP's MariaDB 10.4 (`JSON_ARRAYAGG`); phpMyAdmin is the documented viewer | verified in Phase 2 |
| Demo admin | `admin@localhost.test` / `ChangeMe123!`, development only, Argon2id-hashed, refused in production, removed by `db:purge-demo` | you (brief) |
| Auth tokens (Phase 3) | Access JWT (15 min) + refresh JWT (30 d, own secret) returned in the body; only SHA-256 hashes are stored, in three tables (`refresh_tokens`, `email_verification_tokens`, `password_reset_tokens`); rotation with family reuse detection. Details: [02 §5.1](02-architecture.md#51-auth--sessions) | you (brief) + me |
| JWT library | `@nestjs/jwt` 12 (official, supports Nest 12) and a small custom guard instead of Passport: fewer moving parts, exact control of the 401 codes, and a strict `HS256` allow-list | me |
| Secure by default | A global `JwtAuthGuard`: every route needs a token unless `@Public()`. A test sweeps every documented route unauthenticated against an explicit allow-list | you (brief) |
| Failed logins for blocked accounts | Recorded as audit action `ACCOUNT_SUSPENDED` (correct password, suspended/deactivated account) instead of `LOGIN_FAILED`, which is kept for wrong credentials and unverified emails | me |
| Phase 4 scope | "Colleges only" (plan item 7), chosen by you when asked. Categories, places and search are later phases | you |
| College lifecycle | DRAFT -> ACTIVE <-> INACTIVE, never deleted; a new college is a DRAFT; repeating an action is a no-op; the slug can change only while DRAFT (a published slug is a public link) | me |
| Public vs staff | Browsing is anonymous and cacheable (`public, s-maxage=60`); staff routes need `colleges.manage` and are `no-store`. Errors are always `no-store` (found in testing: Nest applies a route's Cache-Control before the handler, so a 400 or a 5xx would have been cacheable) | me |
| College search | `q` is plain text: `%`, `_` and `\` are escaped (Prisma's `contains` does not, so `q=%` used to match every college) | found in testing |
| `nearest` / `popular` sorts | Computed in memory over all matches, because they cannot be a portable `ORDER BY`; fine for a directory of hundreds to a few thousand colleges | me |
| Auth end-to-end tests | Run against the real `link_platform` (no second database): every account uses the reserved domain `@auth-e2e.localhost.test`, every request an `e2eauth-` id, and only those rows are deleted before and after the suite | me (constraint: no second DB) |
| Phase 5 backend scope | "Categories only" (plan item 8), chosen by you when asked | you |
| Category/amenity lifecycle | ACTIVE <-> INACTIVE only, no DRAFT: a new category or amenity is ACTIVE unless `status: "INACTIVE"` is sent, unlike colleges. Never deleted; repeating an action is a no-op | me |
| Category tree shape | Exactly two levels, enforced by the service layer, not the schema: `parentId` on create must reference an existing top-level group; `parentId` and `status` are immutable via PATCH (recreate instead of re-parenting) | you (brief) + me |
| Attributes/rating dimensions scope | Only a category (never a group) may have them; adding one to a group is a `400`. An attribute's `key` and `dataType` are permanent once created | me |
| Shared contracts/utils extraction | `diffFields`, slug generation (`apps/api/src/common/utils`) and plain-text/slug/id field builders (`packages/contracts/src/text.ts`) were pulled out of the colleges-specific modules into generic ones before categories needed the same logic, with colleges' own exports/tests unchanged via thin re-export wrappers | me |
| Frontend brought forward | You asked for a frontend foundation alongside Phase 5's backend, ahead of the master spec's "backend first, UI from phase 17" order. Scope: app shell, a handful of design-system primitives, session handling, auth pages and the public college directory — see [05](05-frontend.md) | you |
| Forms without react-hook-form | Plain React state + the contracts' own zod schemas (`safeParse` on submit); no new dependency for a handful of forms at this size | me |
| `notFound()` needs the parent's `loading.tsx` out of the way | Found in testing: a parent segment's `loading.tsx` streams a 200 shell before a sibling dynamic route's `notFound()` resolves, so that route never gets a real 404. Fixed by removing `/colleges/loading.tsx` and having both `generateMetadata` and the page call `notFound()` from one memoized fetch | found in testing |
| Phase 6 scope | "Places — full scope" (plan item 9), chosen by you when asked: images stay URL-only (colleges' pattern), not a new upload abstraction; frontend continues alongside it | you |
| Place lifecycle | DRAFT -> ACTIVE <-> INACTIVE only, same as colleges. `PENDING`/`REJECTED` exist in the schema for student submissions (a later phase) but this API never sets or reaches them | me |
| `places.create`/`places.update` left unwired | Already seeded for `BUSINESS_OWNER`, but no route uses them this phase: a real ownership resource policy needs a `BusinessProfile` concept that does not exist until Phase 12. Every route here needs `places.manage` (staff only) instead | me |
| Category assignment is required, attribute values are not | A place needs >=1 leaf (never group) category, since that is core to what a place *is*; the first id is primary and decides the price-comparison unit. Per-category custom field values (`place_attribute_values`, e.g. a PG's `gender`) are deferred: the seed already writes them, but building read/write plus the runtime validator was a bigger scope than "CRUD, lifecycle, prices, hours, amenity links and images" covers | me |
| Price summary rule | `priceMin`/`priceMax`/`priceUnit` compare only price options in the primary category's `defaultPriceUnit` (or the first option's own unit if none match) — the exact rule the Phase 2 seed already used, now shared as `summarizePrices` instead of living only in the seed | me |
| College proximity, reversed | `CollegeProximityService.recomputeForPlace(placeId)` (new) reads every college into memory and checks distance against each one's own radius, rather than adding a new spatial query — consistent with the existing "hundreds, not millions, of colleges" scale assumption | me |
| College hub gets real places | The Phase 5 "coming soon" placeholder on `/colleges/[collegeSlug]` is replaced with a real, working place list once the Places API exists, matching what the frontend scope always intended it to become | you (brief) |
| College-embedded place list has no URL sync | Unlike the standalone `/colleges` directory, the places-at-this-college list is a section of a page, not a page of its own, so its search/sort/page live in component state only, not the query string | me |
| Open in Google Maps is a real link, not a click handler | A plain `<a href target="_blank">`, not a Button `onClick` calling `window.open` — avoids needing `'use client'` on the whole detail view, and is more correct anyway (works without JS, opens properly on mobile) | me |
| Phase 7 scope | "Places full-text search + ranking" (a narrowed plan item 10), chosen by you over the full roadmap scope (cross-entity `/search`, autocomplete, analytics) or the smallest option (filters only, no `FULLTEXT`); frontend continues alongside it again | you |
| First real migration since Phase 2 | `CREATE FULLTEXT INDEX places_name_description_idx` — additive only (a new index, no column/table change). Confirmed empirically that Prisma 7's `@@fulltext`/`_relevance` need no preview-feature flag and genuinely compile to MariaDB's native `MATCH() AGAINST()` (proven by the exact MariaDB error, code 1191, when queried before the index existed) | me (verified, not assumed) |
| Relevance ranking is rank fusion, not a weighted SQL score | Prisma's `_relevance` orders rows but cannot return the underlying match score as a value, so it can't be blended with distance/verified in one `ORDER BY` without raw SQL. Chose rank-position fusion (0.5 text + 0.2 proximity + 0.1 verified, rating term dropped) over raw SQL, to keep ranking a pure, unit-tested function like every other sort rule in this codebase, at the cost of not matching MySQL's literal relevance score | me |
| Price/verified filter semantics | `minPrice`/`maxPrice` is a range-overlap check (a place with no price never matches, even with no bounds given elsewhere); `verified=true` is the only useful value (a checkbox, not a tri-state) | me |
| `/search` doubles as a filter browser | With no keyword, price/verified filters alone still return results (sort falls back to `name`, since `relevance` needs a query) — more useful than requiring a keyword just to use a price filter, and the backend already supported it | me |
| `/search` commits on submit, not per keystroke | Unlike `/colleges`' debounced search, three fields (query, min price, max price) would each need independent debouncing; committing on Enter/Search-click is simpler and standard for a dedicated search page. Sort and verified still apply immediately | me |
| `react-hooks/set-state-in-effect` flags 2+ early-return guards, not just synchronous setState | Found building `/search`'s fetch effect: a guard `if (...) { return; }` with NO setState call, added ahead of an already-guarded effect, made the rule flag a LATER, unconditional `setState('loading')` it had never flagged before. Confirmed by bisection (removing/re-adding the guard). Fixed by merging both guards into one `if` block | found in testing |

## Decisions still open

Full table with recommendations: [01 §4](01-analysis-and-risks.md#4-missing-decisions-and-recommended-defaults). The ones that will matter soonest:

| ID | Question | Needed by |
|---|---|---|
| **D1** | Does "Verified" mean staff-confirmed (recommended), separate from "approved and live"? | Phase 9 (places) |
| **D2** | May owners edit low-risk fields on live listings instantly (post-reviewed), with photos and identity fields queued (recommended)? | Phase 12 (business) |
| **D4** | Account minimum age. Many colleges include under-18 junior sections, which has DPDP implications. Needs legal input before public launch. | Phase 5 (registration) |
| **D9** | Phone numbers visible only after sign-in (recommended)? | Phase 9 |
| **D11** | Who collects the verified Ahilyanagar data? | Phase 4 (seed) |

Unless you say otherwise I will proceed with the recommended default for each when its phase arrives, and record it here.
