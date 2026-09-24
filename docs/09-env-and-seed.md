# 09 · Environment variables and seed strategy

Answers spec §62 items **11** and **12**, and spec §35, §53, §55.

## 1. Environment variables

Rules: **never commit real values**; only the `.env.example` files are tracked. Each app has its own env file so the web app never sees database credentials: `apps/api/.env` (copied from `apps/api/.env.example`) and `apps/web/.env.local` (copied from `apps/web/.env.example`). The API validates its env with zod at boot and **fails fast** on anything missing or malformed. Anything prefixed `NEXT_PUBLIC_` is public by definition and can never hold a secret.

### 1.1 API (`apps/api`)

| Variable | Secret | Required | Default / example | Purpose |
|---|:-:|:-:|---|---|
| `NODE_ENV` | | ✔ | `development` | environment |
| `PORT` | | | `3001` | listen port |
| `API_BASE_URL` | | ✔ | `http://localhost:3001` | absolute URL (links in emails, OpenAPI server) |
| `WEB_BASE_URL` | | ✔ | `http://localhost:3000` | links in emails, redirects |
| `CORS_ORIGINS` | | ✔ | `http://localhost:3000` | comma-separated allow-list |
| `TRUST_PROXY` | | | `true` behind a proxy | correct client IP for throttling |
| `LOG_LEVEL` | | | `info` | pino level |
| `SWAGGER_ENABLED` | | | `true` dev, `false` prod | expose `/api/docs` |
| `DATABASE_URL` | ✔ | ✔ | XAMPP default: `mysql://root:@localhost:3306/link_platform` (root, empty password) | Prisma. URL-encode special characters in the password |
| `SHADOW_DATABASE_URL` | ✔ | optional | | only if the MySQL user cannot create databases (Prisma otherwise creates a temporary shadow database for `migrate dev`) |
| `JWT_ACCESS_SECRET` | ✔ | prod | ≥ 32 random characters (48+ recommended) | signs access tokens. **Implemented (Phase 3).** Unset outside production = a built-in **public** development secret with a startup warning; in production it is required, must not contain `dev-only` / `change-me`, and the API refuses to start otherwise |
| `JWT_REFRESH_SECRET` | ✔ | prod | a **different** ≥ 32 character value | signs refresh tokens (same rules; must differ from the access secret) |
| `JWT_ACCESS_EXPIRES_IN` | | | `15m` | access lifetime: number + `s` / `m` / `h` / `d` |
| `JWT_REFRESH_EXPIRES_IN` | | | `30d` | refresh lifetime (rolling: each rotation extends it) |
| `AUTH_RATE_LIMIT`, `AUTH_RATE_LIMIT_TTL_SECONDS` | | | `20`, `60` | per-IP, per-route limit on login / register / resend / forgot / reset / refresh |
| `COOKIE_DOMAIN` | | prod | `.example.com` | refresh-cookie scope |
| `COOKIE_SECURE` | | | `true` prod | `Secure` flag |
| `EMAIL_VERIFICATION_EXPIRES_IN` | | | `24h` | **Implemented (Phase 3)** |
| `PASSWORD_RESET_EXPIRES_IN` | | | `1h` | **Implemented (Phase 3)** |
| `EMAIL_PROVIDER` | | ✔ | `console` (dev) / `memory` (tests); `smtp` later | provider selection. `console` prints emails **including their one-time links** to the API log, so the API refuses to start in production with it (no production provider exists yet) |
| `EMAIL_FROM`, `APP_NAME` | | | `CampusPin <no-reply@localhost.test>`, `CampusPin` | sender and product name in emails (a real sender needs SPF/DKIM/DMARC) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | | smtp | | transport (not needed in development: the console provider logs emails) |
| `SMTP_USER`, `SMTP_PASSWORD` | ✔ | smtp | | credentials |
| `STORAGE_PROVIDER` | | ✔ | `memory` test / `cloudinary` | provider selection |
| `CLOUDINARY_CLOUD_NAME` | | cloudinary | | |
| `CLOUDINARY_API_KEY` | ✔ | cloudinary | | |
| `CLOUDINARY_API_SECRET` | ✔ | cloudinary | | |
| `CLOUDINARY_FOLDER_PREFIX` | | | `dev/`, `staging/`, `prod/` | isolates environments |
| `UPLOAD_DIR` | | | `uploads` | **implemented (Phase 10)**: folder for local-disk image storage (relative to `apps/api`, git-ignored), served at `${API_BASE_URL}/uploads/`. The 5 MB limit is a constant in contracts for now |
| `UPLOAD_MAX_BYTES` | | | `5242880` | 5 MB image limit |
| `UPLOAD_MAX_PIXELS` | | | `8000` | longest edge |
| `THROTTLE_LIMIT`, `THROTTLE_TTL_SECONDS` | | | `120` / `60` | per-IP requests per window (implemented) |
| `THROTTLE_AUTH_LIMIT`, `THROTTLE_AUTH_TTL_SECONDS` | | | `10` / `60` | stricter login/register/forgot limits (added with authentication) |
| `ANALYTICS_HASH_SECRET` | ✔ | ✔ | random | daily-rotating session-hash salt derivation |
| `WEB_REVALIDATE_URL` | | | `http://localhost:3000/api/revalidate` | ISR webhook target |
| `REVALIDATE_SECRET` | ✔ | | shared with web | HMAC for revalidate |
| `SEED_SUPER_ADMIN_EMAIL` | | bootstrap | | first SUPER_ADMIN (CLI only) |
| `SEED_SUPER_ADMIN_PASSWORD` | ✔ | bootstrap | | **remove from env after first run** |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | ✔ | | `admin@localhost.test` / `ChangeMe123!` | the **demo** admin created by `npm run db:seed` (development only; the seed refuses to run demo data when `NODE_ENV=production`; there is no `SEED_DEMO` variable, use `db:seed:reference` instead) |
| `SENTRY_DSN` | ✔ | optional | | error tracking |
| `REDIS_URL` | ✔ | future | | when > 1 instance |
| `STAFF_TOTP_ENCRYPTION_KEY` | ✔ | Phase 1b | | encrypts TOTP secrets |
| `SMS_PROVIDER`, `SMS_*`, `DLT_*` | ✔ | future OTP | | phone OTP (needs TRAI DLT registration) |
| `EXPO_ACCESS_TOKEN` / `FCM_*` | ✔ | future push | | mobile push |

### 1.2 Web (`apps/web`)

| Variable | Secret | Example | Purpose |
|---|:-:|---|---|
| `NEXT_PUBLIC_SITE_URL` | | `http://localhost:3000` | canonical/OG URLs, sitemap |
| `NEXT_PUBLIC_API_URL` | | `http://localhost:3001/api/v1` | browser API base (implemented) |
| `API_INTERNAL_URL` | | `http://localhost:3001/api/v1` | server-side fetches (SSR/ISR), added with the SSR pages |
| `NEXT_PUBLIC_BRAND_NAME` | | `CampusPin` | brand fallback (single source in `brand.ts`) |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | | `en` | i18n |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | | | image loader |
| `NEXT_PUBLIC_MAP_STYLE_URL` | | | MapLibre style (domain-restricted public key) |
| `REVALIDATE_SECRET` | ✔ | | verifies API webhook |
| `NEXT_PUBLIC_SENTRY_DSN` | | optional | error tracking |

### 1.3 Local infrastructure: XAMPP

MySQL comes from XAMPP (Control Panel → start **MySQL**; Apache is only needed for phpMyAdmin). On the reference machine the module is **MariaDB 10.4.32** listening on `3306` with user `root` and an empty password. The database `link_platform` is created once (see the root README) and the API reaches it through `DATABASE_URL`. There is no Docker requirement.

### 1.4 Mobile (future, `apps/mobile`)

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_MAP_STYLE_URL`. No secrets in the app bundle.

## 2. Seed strategy

> **Implemented in Phase 2.** `npm run db:create` creates the database; `npm run db:seed` runs layers 0 and 2 (reference data + demo data + a demo admin, all idempotent); `npm run db:seed:reference` runs layer 0 only; `npm run db:purge-demo` removes all demo rows and demo accounts. The first run creates 516 records (5 roles, 17 permissions, 49 grants, 24 categories, 48 attributes, 62 rating dimensions, 18 amenities, 1 demo admin, 3 demo colleges, 14 demo places and their child rows, 41 college↔place links). The real-data CSV import (layer 3) and the production admin bootstrap (layer 1) come in later phases.

Principle: **reference data is code, demo data is disposable, real data is imported with provenance.** Nothing is scraped. Nothing fake can be mistaken for a real business.

### Layer 0: reference seed (all environments, idempotent)

Runs via upserts on stable keys, safe to re-run: roles, permissions, `role_permissions`, city **Ahilyanagar** (`aliases: ["Ahmednagar"]`, timezone `Asia/Kolkata`, approximate centre ≈ 19.09 N, 74.75 E: **verify before use**), the category tree with attributes / rating dimensions / amenities, `app_settings` defaults (duplicate thresholds, ranking weights, quotas).

| Group | Categories (slug) | Key attributes and price unit | Rating dimensions |
|---|---|---|---|
| Accommodation | `rooms`, `pg`, `hostels` | gender (boys / girls / co-ed), sharing (single / double / triple), deposit, food included, furnished, attached bathroom, available from, security (CCTV / guard / biometric / warden). Unit: month | Cleanliness, Safety, Value, Owner behaviour |
| Food | `mess`, `tiffin`, `restaurants`, `cafes` | diet (veg / non-veg / both), meals (breakfast / lunch / dinner), timing via hours. Unit: month (mess/tiffin), meal (restaurants/cafes) | Food, Price, Hygiene |
| Study | `libraries`, `reading-rooms`, `xerox-printing` | seating capacity, 24-hour, daily price option. Amenities: AC, WiFi, charging. Unit: month (libraries), page (xerox) | Ambience, Facilities, Value |
| Daily needs | `laundry`, `gyms`, `grocery`, `medical` | pickup/delivery, trainer, home delivery, 24-hour. Unit: month (gym), kg (laundry) | Quality, Price, Service |
| Transport | `bike-rentals`, `car-rentals`, `auto`, `bus` | vehicle types, deposit, fuel policy. Unit: day / trip | Condition, Price, Service |

These follow the examples in spec §6 and §9. Admins can add categories and attributes later without code changes.

### Layer 1: bootstrap

`npm run admin:bootstrap` creates the first `SUPER_ADMIN` from `SEED_SUPER_ADMIN_EMAIL/PASSWORD`. It refuses if a super admin already exists, and the password variable should then be removed from the environment. There is no default credential anywhere.

### Layer 2: demo seed (dev and staging only)

Guarded by `SEED_DEMO=true` **and** a hard `assertNotProduction()`. Every demo row is `is_demo = true`, `source = DEMO_SEED`, with names visibly marked (`[Demo]`), emails at `@example.com`, no real phone numbers, illustrated placeholder images (never stock photos of real businesses). The UI shows a "Demo data" ribbon, and demo rows are excluded from sitemaps and search-engine indexing.

Contents (deterministic; seeded PRNG so runs are reproducible):

- **3–4 demo colleges** near the demo city centre. *Real institution names are used only once you supply verified names and coordinates*; until then they are labelled sample colleges. This keeps invented coordinates from being presented as facts.
- **~60 demo places** across all categories, placed 200 m–4 km from colleges, with varied prices, ratings, hours, amenities and photos.
- **~12 demo students, 3 demo owners, ~150 demo reviews**, skewed 3.5–4.6 so sorting and the Bayesian score are exercised.
- **Edge cases on purpose:** place with no photos · no hours · 24-hour library · permanently closed place · place linked to two colleges · claimed and unclaimed places · near-duplicate pairs 40–80 m apart (`Sai Krupa Mess` / `Sai Kripa Mess`, `Shree Ganesh PG` / `Ganesh PG`) · pending submissions · pending contributions · pending and competing claims · a reported review · a suspended user. Every moderation queue therefore has content in staging.
- Demo accounts use fixed passwords documented in the seed script, **dev/staging only**.

`npm run db:purge-demo` removes all `is_demo` rows: the only sanctioned hard-delete path.

### Layer 3: real data import (production)

The admin **Imports** tool (and CLI) ingests verified CSVs with a **dry-run report** first: validation errors per row, duplicate matches (using the same `DuplicateDetectionService`), and a summary; then an explicit commit. Every imported row records provenance.

`colleges.csv`: `name, short_name, city, address, pincode, latitude, longitude, website, affiliation, source, verified_by, verified_on`

`places.csv`: `name, category_slug, secondary_category_slugs, college_slugs, address, locality, latitude, longitude, phone, whatsapp, website, price_label, price_amount, price_unit, hours, amenities, attributes (key=value;…), description, source, verified_by, verified_on`

Rules: coordinates must be inside the city bounds; category and attribute keys must exist; photo URLs are not fetched server-side (photos are uploaded through the normal pipeline); `verified_on` populates `last_verified_at`; rows flagged as duplicates require an explicit decision.

**Data-collection playbook (D11):** volunteers field-verify with the CSV (or a mobile form later); each college needs ≥ 8 verified places in each of the top 6 categories before it is promoted publicly (the **density gate**).

### Test fixtures are separate

Tests use factories under `apps/api/test/factories` and never depend on the demo seed. Migrations, reference seed and factories are what CI runs against a fresh MySQL.

### Scripts

| Script | Purpose |
|---|---|
| `npm run db:migrate` | apply migrations (dev: `migrate dev`; deploy: `migrate deploy`) |
| `npm run db:seed:reference` | Layer 0 (idempotent) |
| `npm run admin:bootstrap` | Layer 1 |
| `npm run db:seed:demo` | Layer 2 (refuses in production) |
| `npm run db:purge-demo` | remove demo rows |
| `npm run db:reconcile` | recompute denormalised fields (`college_places`, ratings, counts, price min/max) |
| `npm run import:colleges` / `import:places` | CLI wrappers around the import service (`--dry-run`) |
