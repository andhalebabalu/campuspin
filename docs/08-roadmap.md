# 08 · Development roadmap, testing and quality gates

Answers spec §62 item **10** and spec §51, §54, §61.

## 1. Phases (implementation order)

The order below is the one specified for implementation: **backend first, then UI**. Each phase ends with a build, tests, a verified run and a short summary; the next phase starts only when asked. Sizes are relative effort (**S** ≈ days, **M** ≈ 1–2 weeks, **L** ≈ 2–4 weeks).

| # | Phase | Scope | Exit criteria | Size | Status |
|---|---|---|---|---|---|
| 1 | Project setup | npm-workspaces monorepo, Next.js + NestJS scaffolds, TypeScript, Tailwind, env files, API foundation (envelope, errors, zod validation, CORS, `/api/v1` versioning, Swagger, throttling, logging, security headers), Prisma wiring, `GET /api/v1/health`, web ↔ API check | Web and API start; Swagger opens; the web app calls `/api/v1/health` through the API client; unit + e2e tests green | M | **Done** |
| 2 | XAMPP MySQL + Prisma | Create `link_platform`, full Prisma schema, validate, generate, initial migration, apply to XAMPP, verify tables | Tables exist in XAMPP; `prisma migrate status` clean; `/health/database` OK; **MariaDB 10.4 compatibility verified** (risk T13) | M | **Done** |
| 3 | NestJS foundation (rest) | Cache port, domain events, audit service, module skeletons (Auth … Admin) | Modules load; audit rows written; tests | S | Next |
| 4 | Migrations + seed | Roles, permissions, category tree + attributes + amenities, labelled demo colleges/places | Idempotent seed; demo data flagged and excluded from production | M | **Delivered in Phase 2** |
| 5 | Authentication | Register, verify email, login, refresh rotation, forgot/reset, email-provider abstraction (dev logging) | All flows integration-tested; refresh-reuse revokes family | L | |
| 6 | Roles + authorization | Permission guards, resource policies, audit of admin actions | Permission-matrix tests generated from [07-rbac](07-rbac.md); route-map test | M | |
| 7 | Colleges | CRUD, activate/deactivate, verify, list/detail | Admin-only writes enforced; tests | S | |
| 8 | Categories | Tree, attributes, amenities, filter descriptors, admin CRUD | Categories are 100 % data-driven | M | |
| 9 | Places | CRUD, lifecycle/moderation, prices, hours, amenities, images (storage abstraction + local upload) | Lifecycle transitions and ownership rules tested | L | |
| 10 | Search + filters + distance | Keyword, category, college, distance (Haversine), price, rating, verified, sorts, pagination; `college_places` | p95 list < 150 ms at 10k places; `EXPLAIN` reviewed | L | |
| 11 | Student submissions | `POST /place-submissions`, duplicate detection service, contributions, moderation | Duplicate fixture set passes; nothing goes live unreviewed | L | |
| 12 | Business owner | Profile, listings (draft → submit), images, pricing, hours, leads architecture | Owners cannot bypass moderation | M | |
| 13 | Claim listing | Claim flow, evidence, admin decision, history | One owner per place; competing claims handled | M | |
| 14 | Reviews | Rating, dimensions, photos, owner reply, aggregates | One review per user per place; owners cannot delete | M | |
| 15 | Reports | Unified report queue, resolution, audit | Report abuse controls tested | S | |
| 16 | Saved places | Save / unsave / list | Idempotent; tests | S | |
| 17 | Next.js foundation | Design-system primitives, layouts, session/auth, API client extended | Primitives documented and tested | L | |
| 18 | Public website | Landing, college picker, college hub, category listing, place detail, search, auth pages | Responsive; skeleton / empty / error states everywhere | XL | |
| 19 | Student discovery UI | Home, saved, suggest-a-place, profile | Real API only, no mocks | L | |
| 20 | Business dashboard | Listings, claims, reviews, leads, analytics, profile | | L | |
| 21 | Admin dashboard | Queues, colleges, categories, places, users, reports, audit | Every queue operable end to end | L | |
| 22 | Integration testing | Playwright flows over the real stack | The 11 required scenarios pass | M | |
| 23 | Performance + security review | Indexes, caching, headers/CSP, dependency audit, a11y | Quality gate below is met | M | |
| — | After the MVP | Deployment prep, pilot college, Phase 1b (offers, team invites, staff 2FA, notification preferences), Marketplace, Community, Monetisation, React Native app on the same API | | | |

**Suggested calendar anchor (assumption to validate with local colleges):** demand for rooms/PGs spikes around admissions (roughly June–August). Working backwards from a public launch in about **May–June 2027**, the pilot and data collection would fall in roughly **January–March 2027**.

## 2. Testing strategy

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Vitest | duplicate scoring and normalisation, Haversine, open-now computation, rating aggregation (Bayesian), price normalisation, attribute validator, slug generation, permission resolution, outbox backoff |
| Integration (API) | Vitest + Supertest + **real MySQL** (XAMPP, a separate `link_platform_test` database), factories (not the demo seed) | every controller: happy path, validation, auth (`401`), permissions (`403`), ownership, state transitions, transactions |
| Permission matrix | generated from `rbac.matrix.ts` + route-map test | every endpoint × role |
| Component | Vitest + Testing Library | cards, filter bar, forms, states (loading / empty / error), rating, stepper |
| E2E | Playwright (+ axe) | the flows below, on desktop and a mobile viewport |
| Non-functional | k6 or autocannon (light), `EXPLAIN` checks, Lighthouse CI | list/search latency at 10k places, key-page performance and a11y |
| Security | gitleaks, `npm audit`, dependency review, manual checklist against [02 §7](02-architecture.md#7-security-decisions) | secrets, deps, authz, uploads, injection |

### Required scenarios from the spec

| Scenario | Unit | Integration | E2E |
|---|:-:|:-:|:-:|
| Registration | ✔ (DTO, password policy) | ✔ (202 always, generic on duplicates, token created, email enqueued) | ✔ |
| Email verification | ✔ | ✔ (single use, expiry, resend throttle) | ✔ (link read from the development email log) |
| Login | ✔ | ✔ (unverified, suspended, throttle, refresh rotation and reuse) | ✔ |
| College selection | | ✔ (persists to profile, emits event) | ✔ (anon cookie and signed in) |
| Place discovery | ✔ (distance, sort) | ✔ (filters, sorts, pagination, `college_places`) | ✔ |
| Place submission | ✔ (duplicate scoring) | ✔ (quota, server-side duplicate re-check, `409`, merge) | ✔ (suggest → dup prompt → submit) |
| Business listing | | ✔ (draft → submit → approve → live, tiered edits) | ✔ |
| Claim listing | | ✔ (competing claims, transactional approval, evidence privacy) | ✔ |
| Review | ✔ (aggregates) | ✔ (one per user, own-business block, owner reply, no owner delete) | ✔ |
| Report | | ✔ (dedupe, auto-hide rule, resolution actions, reporter notified) | ✔ |
| Admin approval | | ✔ (permissions, audit rows, notifications, conflict-of-interest rule) | ✔ |

## 3. Quality gate (Definition of Done)

A feature is **not** done because the happy path works. The PR checklist mirrors spec §61:

1. **UX** is intuitive (reviewed on a real phone).
2. **Responsive** at 360, 768, 1024 and 1280 px.
3. **Secure**: authz on every mutation, inputs validated, no sensitive data in responses or logs.
4. **API is mobile-reusable**: no web-only assumptions; documented in Swagger and [04](04-api-spec.md).
5. **Schema is normalised** (justified denormalisation has a single writer).
6. **Indexes** exist for its queries; `EXPLAIN` checked.
7. **Validation** on both client (contract schema) and server.
8. **Loading, skeleton, empty, error and retry** states exist.
9. **UI is premium**: uses tokens and components only, no one-off styles.
10. **Scales**: paginated, no N+1, explicit `select`.
11. **Reusable**: no duplicated business logic; shared code in contracts or services.
12. **Tested** at the right levels above, and CI is green.

Plus: no `any` without a comment, no dead code, no new dependency without justification, docs updated.

## 4. Working agreements

- Each phase ends with a build, tests, a verified run and a short written summary of what changed, what was tested and what is deferred. **The next phase starts only when asked.**
- **Commits:** one or more meaningful commits per phase (conventional style: `feat:`, `fix:`, `docs:`, `test:`). `.env` files and secrets are never committed. Nothing is pushed unless asked.
- Schema and API changes go through the docs first (small edits to 03/04), so documentation never drifts from code.
- Version drift is checked at each install: current stable Next, React, Tailwind, Nest, Prisma. Breaking changes are read before use.
