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
| Auth end-to-end tests | Run against the real `link_platform` (no second database): every account uses the reserved domain `@auth-e2e.localhost.test`, every request an `e2eauth-` id, and only those rows are deleted before and after the suite | me (constraint: no second DB) |

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
