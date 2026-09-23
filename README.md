# Student Ecosystem Platform (working name: LINK)

Everything a student needs around their college: rooms, PGs, hostels, messes, libraries, gyms, laundry, transport and more, discoverable by college, verified by staff, contributed to by students and maintained by business owners.

> **Status: Phases 1–7 complete** (project setup; the XAMPP MySQL + Prisma database; authentication, JWT and role-based access; the college directory; the category catalogue; a Next.js frontend foundation with real auth, college-directory, place and search pages; the place directory; and full-text place search). The rest of the product features arrive in the following phases (see [Roadmap](#roadmap)).

Launch market: Ahilyanagar, Maharashtra. The working brand name `LINK` lives in one config value and can change without touching the architecture.

---

## Architecture

```
  Browser ─────────────┐
                       ▼
   Next.js (apps/web) ──►  API client (packages/api-client)  ──HTTP──►  NestJS (apps/api)
   port 3000                                                            port 3001, /api/v1
                                                                              │
                                                                          Prisma
                                                                              │
                                                                     MySQL (XAMPP)
                                                                     database: link_platform
```

- **The web app never talks to the database.** It only calls the REST API. `DATABASE_URL` exists only in `apps/api/.env`.
- **All business logic lives in the API**, so the future React Native app can use the exact same `/api/v1` endpoints.
- **One contract package** (`packages/contracts`) holds the zod schemas, error codes and types shared by the API, the web app and the future mobile app.
- Every API response uses one envelope:

  ```jsonc
  // success
  { "success": true, "data": { "status": "ok" }, "message": "API is running" }
  // failure
  { "success": false, "message": "Validation failed",
    "error": { "code": "VALIDATION_ERROR", "details": { "fields": { "email": ["Invalid email address"] } } },
    "requestId": "0195f0e2-..." }
  ```

Detailed design lives in [docs/](docs/README.md): architecture, database/ERD, API spec, frontend structure, design system, permission matrix, roadmap, environment and seed strategy.

## Tech stack

| Layer | Technology |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| API | NestJS 12 (ESM), Express, REST, Swagger/OpenAPI, zod validation, pino logging, Helmet, rate limiting |
| Database | MySQL protocol via **XAMPP** (MariaDB 10.4) locally, Prisma 7 ORM |
| Shared | `@platform/contracts` (zod schemas + types), `@platform/api-client` (typed HTTP client) |
| Tooling | npm workspaces, Vitest, ESLint, Prettier, TypeScript 6 |

## Folder structure

```
.
├─ apps/
│  ├─ api/                  NestJS API (@platform/api)
│  │  ├─ prisma/            schema.prisma, migrations/, seed.ts + seed/ (roles, categories, demo data)
│  │  ├─ scripts/           db:create and db:purge-demo
│  │  ├─ src/
│  │  │  ├─ common/         response envelope, error filter, zod validation, Swagger helpers
│  │  │  ├─ infra/          config, database (Prisma), logging
│  │  │  └─ modules/        feature modules (health, auth, audit, colleges, categories, places; search, ... next)
│  │  └─ test/              end-to-end tests (Supertest against the real Nest app)
│  └─ web/                  Next.js app (@platform/web)
│     └─ src/
│        ├─ app/            routes (App Router), global styles + design tokens
│        ├─ components/     reusable UI
│        ├─ lib/            env validation and the API client instance
│        ├─ services/       one file per API area; the ONLY place components get data from
│        └─ constants/      brand and other constants
├─ packages/
│  ├─ contracts/            shared zod schemas, error codes, envelope types
│  └─ api-client/           framework-agnostic typed fetch client
├─ docs/                    architecture and design documentation
└─ package.json             npm workspaces + scripts
```

---

## Requirements

| Tool | Version | Check |
|---|---|---|
| Node.js | **24.15 or newer** (see `.nvmrc`) | `node -v` |
| npm | 10 or newer (ships with Node) | `npm -v` |
| XAMPP | any recent version (MySQL/MariaDB module) | XAMPP Control Panel |
| Git | any recent version | `git --version` |

## Quick start (local development with XAMPP)

### Step 1: Start XAMPP MySQL

Open the **XAMPP Control Panel** and click **Start** next to **MySQL**. It should turn green and show port `3306`.
Apache is optional: you only need it to open phpMyAdmin (`http://localhost/phpmyadmin`).

### Step 2: Create the database `link_platform`

Prisma creates the *tables*, but the empty *database* must exist first. The easiest way (needs only MySQL running):

```bash
npm run db:create
```

It reads `DATABASE_URL` from `apps/api/.env`, creates `link_platform` (`utf8mb4` / `utf8mb4_unicode_ci`) if it is missing, and does nothing if it already exists. If MySQL is stopped or the password is wrong it tells you so plainly.

Or create it by hand, once:

**Option A: phpMyAdmin** (needs Apache running)
1. Open `http://localhost/phpmyadmin`
2. Click **New**, enter `link_platform`, choose collation **`utf8mb4_unicode_ci`**, click **Create**.

**Option B: command line** (works with only MySQL running). From any terminal:

```bash
# PowerShell / cmd (XAMPP default root user has NO password)
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS link_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# If you set a root password in XAMPP, add -p and type it when asked:
C:\xampp\mysql\bin\mysql.exe -u root -p -e "CREATE DATABASE IF NOT EXISTS link_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Verify: `C:\xampp\mysql\bin\mysql.exe -u root -e "SHOW DATABASES LIKE 'link_platform';"`

> **Note:** XAMPP's "MySQL" module is actually **MariaDB** (10.4 on the reference machine). Prisma's `mysql` provider works with it; the schema is written to behave identically on MariaDB 10.4 and MySQL 8. One tool does not: see [Prisma Studio](#viewing-the-data-phpmyadmin-and-prisma-studio).

### Step 3: Configure environment files

Each app has its own env file, so the web app never sees database credentials.

```bash
# PowerShell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local

# macOS / Linux / Git Bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The defaults already match a fresh XAMPP install (`root`, empty password, port 3306). If **your root user has a password**, edit `apps/api/.env`:

```env
DATABASE_URL="mysql://root:YourPassword@localhost:3306/link_platform"
```

Special characters in the password must be URL-encoded (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`).

**JWT secrets.** `.env.example` ships placeholder secrets that work locally. Generate your own for `apps/api/.env` (never commit them):

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"   # run twice: access and refresh
```

If you leave them unset the API falls back to built-in **public** development secrets and warns at startup. In production both are required and the API refuses to start with placeholders.

### Step 4: Install dependencies

```bash
npm install
```

The first install downloads a few hundred MB and can take several minutes on a slow connection.
If it fails with `ECONNRESET` or `EPERM` (common on Windows with antivirus scanning), delete `node_modules` and retry with more patience:

```bash
npm install --fetch-retries=6 --fetch-retry-mintimeout=3000 --fetch-timeout=180000
```

### Step 5: Run the database migration

```bash
npm run db:migrate
```

This runs `prisma migrate dev` and applies every migration in `apps/api/prisma/migrations/` to `link_platform`. Phase 2 ships one, `initial_schema`, which creates the 32 tables (see [Database](#database)). Check it:

```bash
npm run db:migrate:status      # -> "Database schema is up to date!"
```

To create a *new* migration after editing `schema.prisma`: `cd apps/api` then `npx prisma migrate dev --name describe_the_change`. (`prisma migrate dev` briefly creates and then drops a temporary "shadow" database while it works; that is normal.)

### Step 6: Seed the database

```bash
npm run db:seed                # reference data + DEMO data + a DEMO admin (development only)
npm run db:seed:reference      # reference data only: roles, permissions, categories, amenities
```

The seed is **idempotent**: run it as often as you like, it never duplicates anything. The first run creates 516 records (see [Seed data](#seed-data)).

> **⚠ Development admin account.** `npm run db:seed` creates a DEMO super admin:
> **`admin@localhost.test` / `ChangeMe123!`**.
> This exists only so a fresh development database is usable. **Change it or remove it before any real deployment.** The password is stored only as an Argon2id hash, the seed **refuses** to create it when `NODE_ENV=production`, and `npm run db:purge-demo` removes it together with all demo data. Override it with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `apps/api/.env`.

### Step 7: Start the API

```bash
npm run build:packages     # once, and again after changing packages/*
npm run dev:api
```

- API: `http://localhost:3001/api/v1`
- Health check: `http://localhost:3001/api/v1/health` returns `{"success":true,"data":{"status":"ok","database":"connected"},"message":"API is running"}` (`"database":"unavailable"` if MySQL is stopped)
- **Swagger UI: `http://localhost:3001/api/docs`** (OpenAPI JSON at `/api/docs-json`)

### Step 8: Start the web app

In a second terminal:

```bash
npm run dev:web
```

Open `http://localhost:3000`. The **System status** card calls the API health endpoints through the API client.

> **One command for everything:** `npm run dev` builds the shared packages, then starts the packages in watch mode, the API and the web app together.

---

## Environment variables

**`apps/api/.env`** (see `apps/api/.env.example` for comments)

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3001` | API port |
| `API_BASE_URL` | `http://localhost:3001` | Public URL of the API (Swagger server URL) |
| `WEB_BASE_URL` | `http://localhost:3000` | Public URL of the web app |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated browser origins allowed to call the API |
| `TRUST_PROXY` | `false` | `true` only behind a reverse proxy |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, `silent` |
| `SWAGGER_ENABLED` | `true` (dev), `false` (production) | Serve Swagger UI at `/api/docs` |
| `DATABASE_URL` | none, **required** | `mysql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `THROTTLE_LIMIT` / `THROTTLE_TTL_SECONDS` | `120` / `60` | Requests allowed per client IP per window |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev fallback (public!) | Two **different** random secrets, 32+ characters. **Required in production** |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `30d` | Token lifetimes: a number plus `s`, `m`, `h` or `d` |
| `EMAIL_VERIFICATION_EXPIRES_IN` / `PASSWORD_RESET_EXPIRES_IN` | `24h` / `1h` | Lifetime of the emailed links |
| `AUTH_RATE_LIMIT` / `AUTH_RATE_LIMIT_TTL_SECONDS` | `20` / `60` | Stricter per-IP limit on the sensitive auth routes |
| `EMAIL_PROVIDER` | `console` | `console` prints emails (with their links) in the API log: **development only**; `memory` is for automated tests |
| `EMAIL_FROM` / `APP_NAME` | `LINK <no-reply@localhost.test>` / `LINK` | Sender and product name used in emails |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `admin@localhost.test` / `ChangeMe123!` | Optional. The **demo** admin created by `npm run db:seed`. Development only; the seed refuses to create it in production |

The API validates these at startup and stops with a readable message if something is missing or malformed.

**`apps/web/.env.local`**

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | Base URL of the API (**public**: embedded in the browser bundle) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URL / metadata base |
| `NEXT_PUBLIC_BRAND_NAME` | `LINK` | Working brand name |

Never put secrets in `NEXT_PUBLIC_*` variables. Real `.env` files are git-ignored; only the `.env.example` files are committed.

## Scripts

Run from the repository root.

| Command | What it does |
|---|---|
| `npm run dev` | Build packages, then run packages (watch) + API + web |
| `npm run dev:api` / `npm run dev:web` | Run one app |
| `npm run build` | Production build of packages, API and web |
| `npm run typecheck` | TypeScript check for every workspace |
| `npm run lint` | ESLint for every workspace |
| `npm test` | Unit tests for every workspace |
| `npm run test:e2e` | API end-to-end tests (boot the real app, call it over HTTP; no database needed) |
| `npm run test:db` | **Database tests** against the real XAMPP database (needs MySQL running and the migration applied) |
| `npm run test:e2e:db` | **Authentication end-to-end tests**: boot the real app and call it over HTTP against the real database (needs MySQL, migrations and `db:seed:reference`) |
| `npm run auth:purge-tokens` | Delete expired refresh / verification / reset tokens |
| `npm run format` / `format:check` | Prettier |

Database commands (they run inside `apps/api`; from there you can also use `npx prisma <command>` directly):

| Command | What it does |
|---|---|
| `npm run db:create` | Create the `link_platform` database if it does not exist |
| `npm run db:validate` | `prisma validate`: check `schema.prisma` |
| `npm run db:generate` | `prisma generate`: build the typed Prisma Client |
| `npm run db:migrate` | `prisma migrate dev`: apply pending migrations (and create new ones) |
| `npm run db:migrate:deploy` | `prisma migrate deploy`: apply migrations only (used for production) |
| `npm run db:migrate:status` | `prisma migrate status` |
| `npm run db:seed` | Seed reference + demo data (idempotent) |
| `npm run db:seed:reference` | Seed reference data only (the only mode allowed in production) |
| `npm run db:purge-demo` | Delete all demo data and demo accounts (reference data is kept) |
| `npm run db:studio` | Prisma Studio (see the limitation below) |

## Database

The API talks to MySQL **only** through Prisma, in one place (`PrismaService`). The web app never touches the database.

```
NestJS  ->  PrismaService  ->  Prisma Client  ->  @prisma/adapter-mariadb  ->  XAMPP MySQL (link_platform)
```

**Configuration.** `apps/api/prisma/schema.prisma` declares `provider = "mysql"`. Prisma 7 no longer allows `url = env("DATABASE_URL")` inside the schema file (it fails validation with error P1012), so the connection string is read from `DATABASE_URL` in `apps/api/.env` by `apps/api/prisma.config.ts` (migrations, seed) and by `PrismaService` (runtime). Nothing is hard-coded.

**35 tables**: 32 created by the `initial_schema` migration and 3 authentication token tables added by `auth_tokens`:

| Area | Tables |
|---|---|
| Users and access | `users`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| Authentication tokens | `refresh_tokens`, `email_verification_tokens`, `password_reset_tokens` (hashes only, never raw tokens) |
| Colleges | `colleges`, `college_images`, `college_places` |
| Catalogue | `categories`, `category_attributes`, `category_rating_dimensions`, `amenities` |
| Places | `places`, `place_categories`, `place_images`, `place_amenities`, `place_hours`, `place_attribute_values`, `place_price_options` |
| Business and claims | `business_profiles`, `business_members`, `place_claims` |
| Community contributions | `place_submissions`, `place_submission_images`, `place_contributions` |
| Reviews and saves | `reviews`, `review_ratings`, `review_reports`, `saved_places` |
| Moderation, notifications, audit | `reports`, `notifications`, `audit_logs` |

**Key design points**

- **One central `places` table.** There are no mess/library/gym/PG tables. Categories are rows in `categories`, and a place can belong to several (`place_categories`): "Study Point" = Library + Reading Room.
- **Category-specific data without schema changes.** `category_attributes` defines the extra fields of a category (Mess: `veg_nonveg`, Library: `seating_capacity`, PG: `gender`, `deposit`, ...); `place_attribute_values` stores the values. New attribute = a new row.
- **A place can serve several colleges** (`college_places`). Distance is **calculated** from the two sets of coordinates (Haversine) and cached in that table; it is never typed in.
- **Prices** are `place_price_options` rows (a PG has single/double/triple), summarised in `places.priceMin/priceMax/priceUnit` for sorting. **Opening hours** are `place_hours` rows (several slots per day, 24 h and closed days). **Amenities** are a normalised list (`amenities` + `place_amenities`).
- **Moderation everywhere:** student suggestions (`place_submissions`, never published directly), corrections to existing places (`place_contributions`), ownership claims (`place_claims`, one open claim per place + business, history kept), reviews (`review_reports`), and a generic `reports` table for future targets.
- **Integrity in the database itself:** foreign keys, unique constraints (`users.email`, all slugs, one saved place / review / member per user), and 23 CHECK constraints (ratings 1–5, valid coordinates, non-negative prices, valid `HH:mm` opening hours).
- **No image bytes in MySQL:** only URLs are stored.

### Seed data

`npm run db:seed` creates (first run, 516 records):

| Data | Rows |
|---|---|
| Roles: `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `STUDENT`, `BUSINESS_OWNER` | 5 |
| Permissions (`users.read` ... `settings.manage`) and role grants | 17 + 49 |
| Categories: 5 groups + 19 categories (Room, PG, Hostel, Mess, Tiffin, Restaurant, Cafe, Library, Reading Room, Xerox, Printing, Laundry, Gym, Grocery, Medical, Bike Rental, Car Rental, Auto, Bus) | 24 |
| Category attributes and rating dimensions | 48 + 62 |
| Amenities | 18 |
| **Demo** super admin (dev only) | 1 |
| **Demo** colleges (+ images) | 3 + 3 |
| **Demo** places, with categories, images, amenities, hours, price options, attribute values | 14 (+ 17 / 14 / 51 / 91 / 21 / 36) |
| **Demo** college ↔ place links (distance calculated) | 41 |

Every demo row is clearly labelled `Sample ... (Demo)`, has no phone or e-mail, and is flagged `isDemo`, so it cannot be mistaken for a real business. The demo coordinates are made-up points, not real addresses.

### Viewing the data: phpMyAdmin and Prisma Studio

- **phpMyAdmin (recommended on XAMPP).** Start Apache and MySQL, open `http://localhost/phpmyadmin`, choose `link_platform`. It lists every table with its row count and lets you browse the data.
- **Prisma Studio (`npm run db:studio`, opens `http://localhost:5555`) does not work with XAMPP's MariaDB 10.4.** It connects, but then fails to load the table list with `FUNCTION link_platform.json_arrayagg does not exist`: Studio's metadata query needs `JSON_ARRAYAGG` returning JSON, which MySQL ≥ 5.7.22 has and MariaDB only added in 10.5. It cannot be shimmed on the server side. To use Studio, run against MySQL 8 / MariaDB ≥ 10.5 (for example by upgrading XAMPP's MariaDB). Never expose Studio publicly in production.

## Authentication and access control

The API owns all authentication; the web and future mobile apps only call it. Everything lives under `/api/v1/auth`. Request bodies, responses and error examples are in Swagger (`/api/docs`).

| Method | Path | Access | What it does |
|---|---|---|---|
| POST | `/auth/register` | public | Creates a `STUDENT` account (**201**) and emails a verification link |
| POST | `/auth/verify-email` | public | `{ token }` from the email; marks the email verified (single use) |
| POST | `/auth/resend-verification` | public | `{ email }`; the answer is identical for every address |
| POST | `/auth/login` | public | Returns `accessToken`, `refreshToken` and the `user` |
| POST | `/auth/refresh` | public | `{ refreshToken }` -> a new access **and** refresh token (rotation) |
| POST | `/auth/logout` | Bearer | Ends this device's session |
| POST | `/auth/logout-all` | Bearer | Ends every session of the user |
| GET | `/auth/me` | Bearer | The current user with roles and permissions |
| POST | `/auth/forgot-password` | public | `{ email }`; the answer is identical for every address |
| POST | `/auth/reset-password` | public | `{ token, newPassword }`; also signs the user out everywhere |

**Tokens.** The *access token* is a short-lived (15 min) JWT with only `sub`, `email`, `roles`, `sid` (session id) and `typ`; send it as `Authorization: Bearer <token>`. The *refresh token* is a 30-day JWT signed with a different secret; the database keeps **only its SHA-256 hash**. Every refresh replaces it with a new one and kills the old; presenting an already-replaced token revokes that whole session (possible theft). Each login is its own session, so a user can be signed in on several devices. Email-link tokens (verification, password reset) are random 256-bit values, single-use, expiring, and also stored hashed only.

**Secure by default.** Every route needs a valid access token unless it is marked `@Public()`. Guards run in this order on every request: rate limit -> authenticate -> roles -> permissions. To protect a route, add decorators from `modules/auth`:

```ts
@Get('queue')
@Roles('MODERATOR', 'ADMIN')            // needs at least ONE of these roles
@Permissions('reviews.moderate')        // and the roles must grant ALL of these
queue(@CurrentUser() user: AuthenticatedUser) { ... }
```

Permission keys are the 17 seeded ones (see [docs/07-rbac.md](docs/07-rbac.md)); grants come from the `role_permissions` table, cached in memory for 60 s.

**Try it locally.** With `EMAIL_PROVIDER=console` (the default) no email is sent: the verification / reset link is **printed in the API terminal**. Copy the token from it:

```bash
curl -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Asha Patil","email":"asha@example.com","password":"Correct-Horse-42"}'
# ...look in the API terminal for "DEV EMAIL" and copy the token=... value...
curl -X POST http://localhost:3001/api/v1/auth/verify-email -H "Content-Type: application/json" -d '{"token":"<token>"}'
curl -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"asha@example.com","password":"Correct-Horse-42"}'
```

The seeded demo admin (`admin@localhost.test` / `ChangeMe123!`, development only) can sign in directly and holds every permission.

**Also worth knowing**

- **Password rules:** 10-128 characters with three of lowercase / uppercase / digit / symbol (or a 16+ character passphrase), not a common password (`Password123!`, `P@ssw0rd`, ...) and not containing the email name. Hashed with Argon2id.
- **Rate limiting:** login, register, resend, forgot, reset and refresh allow `AUTH_RATE_LIMIT` requests per IP per minute per route (default 20), on top of the global `THROTTLE_LIMIT`. Over the limit: `429 RATE_LIMITED` with `Retry-After`.
- **No account enumeration:** a wrong password and an unknown email give the same 401; resend and forgot answer the same for every address. `EMAIL_NOT_VERIFIED` / `ACCOUNT_SUSPENDED` (403) are only shown after the password is proven right.
- **Audit:** `REGISTER`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_SUSPENDED`, `LOGOUT`, `LOGOUT_ALL`, `EMAIL_VERIFIED`, `VERIFICATION_EMAIL_RESENT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `REFRESH_TOKEN_ROTATED`, `REFRESH_TOKEN_REUSE_DETECTED` go to `audit_logs` with IP, user agent and request id, and never contain a password, token or hash.
- **Cleanup:** `npm run auth:purge-tokens` deletes expired tokens; schedule it daily.
- **Limits of this phase:** an access token stays valid until it expires (max 15 min) even after logout, suspension or a role change; the refresh and `/auth/me` always read the database. The rate limiter is per process (in memory). Only the development (`console`) email provider exists; the API refuses to start in production until a real one is added.

## College directory

Students browse colleges without an account; staff manage them behind the `colleges.manage` permission (ADMIN and SUPER_ADMIN). Swagger (`/api/docs`) has every request, response and example.

**Public (no account)**

| Method | Path | What it does |
|---|---|---|
| GET | `/colleges` | Active colleges as cards, paginated. `q` (name, short name, city), `city`, `lat` + `lng` (adds each college's `distanceMeters`), `sort` = `name` (default) / `nearest` / `popular` / `newest`, `page`, `limit` (max 50) |
| GET | `/colleges/:idOrSlug` | One active college with its images and the number of active places serving it |

A draft or deactivated college is a `404`, exactly like one that does not exist. Both routes are cacheable (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300` plus an ETag); an error response is never cached.

**Staff (Bearer token with `colleges.manage`; every response is `no-store`)**

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/colleges` | Every college in any status; filter by `status`, `verification`, `q`, `city`; sort `newest` / `updated` / `name` |
| POST | `/admin/colleges` | Create (a DRAFT unless `status: "ACTIVE"`) |
| GET / PATCH | `/admin/colleges/:id` | Read / edit only the fields you send (`null` clears optional ones) |
| POST | `/admin/colleges/:id/activate`, `/deactivate` | Publish / hide. Optional body `{ "reason": "..." }` goes to the audit log |
| POST | `/admin/colleges/:id/verify`, `/unverify` | Set / remove the public "verified" mark |
| POST / PATCH / DELETE | `/admin/colleges/:id/images[/:imageId]` | Manage the gallery (links to pictures hosted elsewhere; at most 20) |

**Rules worth knowing**

- **Lifecycle:** DRAFT -> ACTIVE <-> INACTIVE. Colleges are never deleted, so history and student links survive. Repeating an action is a harmless no-op; deactivating a draft is a `409`.
- **Slug:** generated from the name (`sample-arts-and-science-college`, then `-2`, `-3` if taken) or supplied. It can change only while the college is a DRAFT, because a published slug is a public link. Reserved words (`popular`, `cities`, ...) and id-shaped values are refused. The same name in the same city is a `409`.
- **Which places serve a college:** every place within `serviceRadiusMeters` (default 5 km, 100 m to 50 km) by straight-line distance, stored in `college_places`. Creating a college, moving it or changing its radius recomputes the links with the same rule the seed uses; a place a staff member PINNED or EXCLUDED keeps that decision. `placeCount` counts ACTIVE places only.
- **Plain text only:** names, addresses and descriptions refuse markup and control characters; links must be http(s) without credentials; coordinates 0, 0 ("null island") are refused; unknown fields in a body are a `400` (so `isDemo` or `status` can never be set by accident).
- **Audit:** `COLLEGE_CREATED`, `COLLEGE_UPDATED`, `COLLEGE_ACTIVATED`, `COLLEGE_DEACTIVATED`, `COLLEGE_VERIFIED`, `COLLEGE_UNVERIFIED` and the three `COLLEGE_IMAGE_*` actions are written in the same transaction as the change. They name the fields that changed, never their text.
- **Limits of this phase:** `sort=nearest` and `sort=popular` read every matching college and order it in memory (fine for hundreds or a few thousand colleges); two staff editing the same college is last-write-wins; the same-name check is best effort under two identical simultaneous requests.

**Try it locally** (with the API running and the demo admin seeded):

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost.test","password":"ChangeMe123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")
curl -X POST http://localhost:3001/api/v1/admin/colleges -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Test College","address":"Station Road","city":"Ahilyanagar","state":"Maharashtra","latitude":19.1,"longitude":74.75,"status":"ACTIVE"}'
curl "http://localhost:3001/api/v1/colleges?sort=nearest&lat=19.096&lng=74.748"
```

## Category catalogue

Students browse the category tree without an account; staff manage it behind the `categories.manage` permission (ADMIN and SUPER_ADMIN). Swagger (`/api/docs`) has every request, response and example.

A category tree is exactly **two levels**: a top-level **group** (e.g. "Stay") holding **categories** (e.g. "PG", "Hostel", "Boys Hostel"). Only a category (never a group) carries attributes, rating dimensions and a default price unit. Unlike colleges, a new category or amenity is **ACTIVE by default** (there is no DRAFT state) — set `status: "INACTIVE"` on create, or deactivate it afterwards, to keep it unpublished.

**Public (no account)**

| Method | Path | What it does |
|---|---|---|
| GET | `/categories` | The tree: every ACTIVE group with its ACTIVE children |
| GET | `/categories/:idOrSlug` | One ACTIVE category or group, with attributes and rating dimensions (empty for a group) |
| GET | `/amenities` | Every ACTIVE amenity |

A category whose group is deactivated is a `404`, even if the category itself is still ACTIVE — hiding a group hides everything under it. Public routes are cacheable (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`); an error response is never cached.

**Staff (Bearer token with `categories.manage`; every response is `no-store`)**

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/categories` | Every group and category, any status |
| POST | `/admin/categories` | Create a group (no `parentId`) or a category (`parentId` of an existing top-level group) |
| GET / PATCH | `/admin/categories/:id` | Read / edit only the fields you send (`parentId` and `status` are not editable here) |
| POST | `/admin/categories/:id/activate`, `/deactivate` | Publish / hide. Optional body `{ "reason": "..." }` goes to the audit log |
| POST / PATCH / DELETE | `/admin/categories/:id/attributes[/:attributeId]` | Manage a category's custom fields (BOOLEAN/INTEGER/DECIMAL/TEXT/ENUM/MULTI_ENUM/DATE) — category only, not a group |
| POST / PATCH / DELETE | `/admin/categories/:id/rating-dimensions[/:dimensionId]` | Manage a category's review-rating axes — category only, not a group |
| GET | `/admin/amenities` | Every amenity, any status |
| POST | `/admin/amenities` | Create (global, not category-scoped) |
| PATCH | `/admin/amenities/:id` | Edit only the fields you send |
| POST | `/admin/amenities/:id/activate`, `/deactivate` | Publish / hide |

**Rules worth knowing**

- **Lifecycle:** ACTIVE <-> INACTIVE only (no DRAFT). Categories and amenities are never deleted, so history survives; repeating an action is a harmless no-op.
- **Two levels, enforced by the API, not the schema:** `parentId` on create must point at an existing top-level group; a category with a `parentId` of its own is refused. `parentId` and `status` cannot change on a PATCH — recreate instead of re-parenting.
- **Attributes and rating dimensions live on categories only:** adding one to a group is a `400`. An attribute's `key` and `dataType` are permanent (a place's value is looked up by key); `ENUM`/`MULTI_ENUM` must have at least one option, every other type must have none. Removing an attribute or dimension already used by a place's data is a `409` (foreign key restrict).
- **Slug:** generated from the name (retried with `-2`, `-3` if taken) or supplied; a slug can be changed at any time via PATCH (categories have no "published" lock like colleges). Reserved words and id-shaped values are refused. The same name under the same parent (or among top-level groups) is a `409`.
- **Plain text only:** names, descriptions and help text refuse markup and control characters; machine keys (`key`) must be lowercase `snake_case`; unknown fields in a body are a `400`.
- **Audit:** `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_ACTIVATED`, `CATEGORY_DEACTIVATED`, the three `CATEGORY_ATTRIBUTE_*` and three `CATEGORY_RATING_DIMENSION_*` actions, and `AMENITY_CREATED`, `AMENITY_UPDATED`, `AMENITY_ACTIVATED`, `AMENITY_DEACTIVATED` are written in the same transaction as the change. They name the fields that changed, never their text.
- **Limits of this phase:** no schema migration was needed (the tables were created in Phase 2); two staff editing the same category is last-write-wins.

**Try it locally** (with the API running and the demo admin seeded):

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost.test","password":"ChangeMe123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")
GROUP=$(curl -s -X POST http://localhost:3001/api/v1/admin/categories -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Test Group"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.id")
curl -X POST http://localhost:3001/api/v1/admin/categories -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"My Test Category\",\"parentId\":\"$GROUP\"}"
curl "http://localhost:3001/api/v1/categories"
```

## Place directory

Students browse places without an account; staff manage them behind the `places.manage` permission (ADMIN and SUPER_ADMIN). Swagger (`/api/docs`) has every request, response and example.

**Public (no account)**

| Method | Path | What it does |
|---|---|---|
| GET | `/places` | Active places as cards, paginated. `q` (name, description, address), `city`, `collegeSlug` (places serving that college), `categorySlug`, `minPrice`/`maxPrice` (range overlap), `verified=true`, `lat` + `lng` (adds each place's `distanceMeters`; with `collegeSlug` alone, distance defaults to "from that college"), `sort` = `name` (default) / `nearest` / `newest` / `cheapest` / `relevance` (needs `q`), `page`, `limit` (max 50) |
| GET | `/places/:idOrSlug` | One active place, with its categories, amenities, opening hours, price options and images |

A draft, pending, rejected or deactivated place is a `404`, exactly like one that does not exist. Both routes are cacheable (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`); an error response is never cached.

**Staff (Bearer token with `places.manage`; every response is `no-store`)**

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/places` | Every place in any status; filter by `status`, `verification`, `q`, `city`; sort `newest` / `updated` / `name` |
| POST | `/admin/places` | Create (a DRAFT unless `status: "ACTIVE"`); `categoryIds` (first = primary), `amenityIds`, `hours` and `priceOptions` can be sent up front or added later |
| GET / PATCH | `/admin/places/:id` | Read / edit only the fields you send (`null` clears optional ones); `categoryIds`/`amenityIds`/`hours`/`priceOptions` REPLACE the whole list when sent |
| POST | `/admin/places/:id/activate`, `/deactivate` | Publish / hide. Optional body `{ "reason": "..." }` goes to the audit log |
| POST | `/admin/places/:id/verify`, `/unverify` | Set / remove the public "verified" mark |
| POST / PATCH / DELETE | `/admin/places/:id/images[/:imageId]` | Manage the gallery (links to pictures hosted elsewhere; at most 20; the first image becomes the cover unless told otherwise) |

**Rules worth knowing**

- **Lifecycle:** this API only ever uses DRAFT → ACTIVE ↔ INACTIVE, exactly like colleges. `PENDING` and `REJECTED` exist in the schema for the student-submission moderation workflow (a later phase) and are not reachable here. Places are never deleted, so history and reviews survive. Repeating an action is a harmless no-op; deactivating a place that was never published is a `409`.
- **Categories:** every place needs at least one, and each id must be a leaf category (never a group) that is ACTIVE. The first id becomes the primary category, which decides the price comparison unit below.
- **Prices:** `priceMin`/`priceMax`/`priceUnit` are computed from `priceOptions`, comparing only the options in the primary category's `defaultPriceUnit` (or the first option's own unit, if none match) — "cheapest" always compares like with like. Recomputed whenever `categoryIds` or `priceOptions` changes.
- **Slug:** generated from the name (`-2`, `-3` if taken) or supplied. It can change only while the place is a DRAFT, because a published slug is a public link.
- **College proximity:** creating or moving a place (changing its coordinates) recomputes `college_places` for every college that might now include or exclude it, reusing the exact `CollegeProximityService` colleges themselves use, in the other direction.
- **Plain text only:** names, addresses and descriptions refuse markup and control characters; links must be http(s) without credentials; coordinates 0, 0 ("null island") are refused; unknown fields in a body are a `400`.
- **Permissions:** `places.create` and `places.update` are already seeded for `BUSINESS_OWNER` but are not wired to any route yet — they are reserved for the business-owner phase's own, ownership-scoped endpoints. Every route in this phase needs `places.manage` (staff only).
- **Audit:** `PLACE_CREATED`, `PLACE_UPDATED`, `PLACE_ACTIVATED`, `PLACE_DEACTIVATED`, `PLACE_VERIFIED`, `PLACE_UNVERIFIED` and the three `PLACE_IMAGE_*` actions are written in the same transaction as the change. They name the fields that changed, never their text.
- **Search (Phase 7):** `sort=relevance` uses a real MySQL/MariaDB `FULLTEXT` index on `name`/`description` (migration `add_place_fulltext_search` — the first schema change since Phase 2), ordered by Prisma's native `_relevance`. Since Prisma can order by relevance but cannot hand back the match score as a value, it can't be blended with distance and verified status in one SQL `ORDER BY`; instead `rankByRelevance` combines their **rank positions** (0.5 text + 0.2 proximity + 0.1 verified, the platform's original weights minus the rating term, which stays 0 until Reviews exists) in application code, over every relevance-matching row. `minPrice`/`maxPrice` never match a place with no price at all; `verified=true` shows only staff-verified places.
- **Limits of this phase:** `sort=nearest`, `sort=cheapest` and `sort=relevance` read every matching place and order it in memory (fine for hundreds to a few thousand places); no student-submission moderation, no business-owner self-service listings, no image upload (URLs only, same as colleges), no per-category attribute values, no unified cross-entity `/search`, no autocomplete and no search analytics yet — all deferred to their own phases.

**Try it locally** (with the API running and the demo admin seeded):

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost.test","password":"ChangeMe123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")
MESS=$(curl -s "http://localhost:3001/api/v1/categories" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.find(g=>g.slug==='food').children.find(c=>c.slug==='mess').id")
curl -X POST http://localhost:3001/api/v1/admin/places -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"My Test Mess\",\"address\":\"Station Road\",\"city\":\"Ahilyanagar\",\"state\":\"Maharashtra\",\"latitude\":19.1,\"longitude\":74.75,\"status\":\"ACTIVE\",\"categoryIds\":[\"$MESS\"]}"
curl "http://localhost:3001/api/v1/places?sort=nearest&lat=19.096&lng=74.748"
curl "http://localhost:3001/api/v1/places?q=mess&sort=relevance"
curl "http://localhost:3001/api/v1/places?minPrice=1000&maxPrice=4000&verified=true"
```

## Student submissions

Any signed-in user (student, business owner or staff — no special role needed) can suggest a new place; staff review it behind the `submissions.review` permission (MODERATOR, ADMIN, SUPER_ADMIN). Swagger (`/api/docs`) has every request, response and example.

**Authenticated (any signed-in user; Bearer token, no `submissions.review` needed)**

| Method | Path | What it does |
|---|---|---|
| POST | `/places/duplicate-check` | Scores nearby places against `{ name, categoryId, latitude, longitude, address?, phone? }`; returns `suggest`/`block`-level candidates only, best first, with human-readable reasons |
| POST | `/place-submissions` | Creates a place (`PENDING`, invisible to the public) and a submission recording the workflow. Re-runs duplicate detection server-side: a `block`-level match without `confirmDifferent: true` is a `409 DUPLICATE_PLACE_SUSPECTED` instead, and nothing is created |
| GET | `/place-submissions/:id` | The submitter's own submission, or any submission for a `submissions.review` holder; anyone else gets a `404` (existence hidden) |

**Staff (Bearer token with `submissions.review`)**

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/submissions` | The moderation queue; filter by `status`, sort `newest` (default) / `oldest` |
| GET | `/admin/submissions/:id` | One submission |
| POST | `/admin/submissions/:id/approve` | Publishes the pending place (`PENDING` → `ACTIVE`); optional `reason` |
| POST | `/admin/submissions/:id/reject` | Rejects the submission and its pending place; `reason` is required — the student's only feedback |
| POST | `/admin/submissions/:id/mark-duplicate` | Links the submission to `duplicateOfPlaceId` instead of publishing a second place; the pending place is rejected |

**Rules worth knowing**

- **Duplicate scoring (`duplicate-rules.ts`):** `0.45 × name + 0.25 × geo + 0.15 × category + 0.10 × address + 0.05 × phone`. Name similarity is Jaro-Winkler over normalised text (lowercased, punctuation/diacritics stripped, a few Indic spelling variants folded — `aa→a`, `w→v`, `ph→f` — and generic category words like "mess"/"hostel"/"pg" removed so they don't dilute the comparison). Geo decays linearly from 1.0 at ≤50 m to 0 at 300 m. Category is 1 for the same leaf, 0.5 for the same group, else 0. Two overrides guarantee a `block`-level score regardless of the blend: an exact phone match, or a near-exact name (≥0.92) within 100 m. Thresholds are the exported constant `DUPLICATE_THRESHOLDS` (`suggest: 0.60`, `block: 0.85`) — there is no settings table, so they are not admin-configurable yet.
- **Candidate pool:** every `DRAFT`/`PENDING`/`ACTIVE` place within a ~2 km bounding box of the suggested point. A place another still-pending submission created is an ordinary `PENDING` place, so "other pending suggestions are candidates too" needs no separate query.
- **A submission creates its place immediately**, not on approval: `POST /place-submissions` inserts a `Place` row with `status: "PENDING"` right away (the same `PENDING` status that has existed in the schema since Phase 2 but was unreachable until now). Approval is `PENDING → ACTIVE`; reject or mark-duplicate is `PENDING → REJECTED`.
- **A submission is lightweight:** one category (not `categoryIds[]`), one optional price point (not `priceOptions[]`), up to 10 photos. `collegeId` is context only — the college page the student was browsing — and never gates anything.
- **A decision is final in this phase:** there is no "request changes" → resubmit loop (the schema's `SubmissionStatus` has `PENDING → UNDER_REVIEW → APPROVED | REJECTED | DUPLICATE`, no `NEEDS_CHANGES`). A student who disagrees with a rejection submits again.
- **Audit:** `SUBMISSION_CREATED`, `SUBMISSION_APPROVED` (plus the resulting place's own `PLACE_ACTIVATED`), `SUBMISSION_REJECTED` and `SUBMISSION_MARKED_DUPLICATE` are written in the same transaction as the change.
- **Limits of this phase:** no contributions (suggesting an edit to an *existing* place — `place_contributions` is untouched), no per-user daily quotas or photo content-hash dedupe, no admin-configurable thresholds. See [02 §5.7](docs/02-architecture.md#57-suggest-a-place-duplicates-contributions) for the full list.

**Try it locally** (with the API running and a verified account signed in):

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword1!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")
MESS=$(curl -s "http://localhost:3001/api/v1/categories" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.find(g=>g.slug==='food').children.find(c=>c.slug==='mess').id")
curl -X POST http://localhost:3001/api/v1/places/duplicate-check -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"My New Mess\",\"categoryId\":\"$MESS\",\"latitude\":19.1,\"longitude\":74.75}"
curl -X POST http://localhost:3001/api/v1/place-submissions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"My New Mess\",\"categoryId\":\"$MESS\",\"address\":\"Station Road\",\"city\":\"Ahilyanagar\",\"latitude\":19.1,\"longitude\":74.75}"
```

## Frontend foundation

Phase 5 built the first slice of `apps/web`, ahead of the master spec's backend-first order (the user asked for this explicitly), and Phases 6, 7 and 8 continued it alongside the place directory, place search and student submissions. It is a **foundation**, not the final product design from [05](docs/05-frontend.md)/[06](docs/06-design-system.md): a working app shell, a small hand-rolled set of design-system primitives on the real tokens, and real pages wired to the APIs that already exist. The marketing home page and the rest of the ~60-screen inventory arrive with their own phases.

**Pages**

| Route | What it does |
|---|---|
| `/login`, `/register` | Sign in / create an account, validated client-side with the same zod schemas the API uses |
| `/verify-email` | Doubles as the token landing page (`?token=`) and the "check your inbox" / resend screen (`?email=`) |
| `/forgot-password`, `/reset-password` | Request a reset link, then set a new password with its token |
| `/colleges` | Server-rendered first page of results (SEO, fast paint) handed off to client-side search, sort and paging that keep the URL in sync |
| `/colleges/[collegeSlug]` | Server-rendered college detail: gallery, description, website, and (Phase 6) a real, working list of the places serving it — search, sort (nearest/cheapest/name/newest) and paging |
| `/places/[placeSlug]` | Server-rendered place detail (Phase 6): gallery, price, categories, amenities, hours, description and an **Open in Google Maps** link (the place's own link if staff set one, otherwise built from its coordinates) |
| `/search` | (Phase 7) A keyword search over places, ranked by real MySQL full-text relevance, that doubles as a plain price-range / verified-only filter browser when no keyword is given. URL-synced, like `/colleges` |
| `/suggest-a-place` | (Phase 8) The first page that genuinely **needs** a session, not just reads one: signed out, it shows a "sign in to continue" prompt (`?next=` brings the visitor straight back after login); signed in, a form to suggest a new place, with a "check for duplicates" step and a 409 from the server itself surfacing the same candidates if skipped |

**Plumbing**

- `lib/auth/token-store.ts` + `lib/auth/session-context.tsx`: the access token lives in memory only, the refresh token in `localStorage`; `SessionProvider` bootstraps a session on load via `POST /auth/refresh` and exposes `login`/`register`/`logout` to the rest of the app. The Navbar reads it to switch between "Sign in / Register" and "Hi, {name} · Sign out".
- `services/auth.service.ts`, `services/colleges.service.ts`, `services/places.service.ts`, `services/categories.service.ts`, `services/submissions.service.ts`: thin wrappers over `@platform/api-client`, typed end to end by `@platform/contracts` — the same schemas the API validates with.
- `components/ui`: `Button`, `Input`, `Card`, `Badge` (now with a `danger` tone, for a duplicate-check candidate scored `block`), `FormAlert` — enough of the [06](docs/06-design-system.md) component spec to build the pages above on the real tokens, not a redesign of the whole system.
- `utils/format-price.ts`: "₹3,000 / month", a range, or "Price on request" — the one place this formatting rule lives, shared by the place card and its detail page.
- `features/search/lib/search-filters.ts`: `hasFilters`/`effectiveSort`, shared between the server page (the first, SSR'd page of results) and the client component (every search after that), so "what counts as a search" and "relevance needs a query, else fall back to name" are each defined exactly once.
- Every page has a real loading, empty and error state (skeletons, `EmptyState`, `ErrorState` with retry and a request id), per [05 §5](docs/05-frontend.md#5-mandatory-states-per-route).

**Rules worth knowing**

- **No new dependencies:** forms are plain React state + the contracts' zod schemas (`safeParse` on submit), not react-hook-form; there is no Radix/CVA, TanStack Query or a map library yet — the pages built so far did not need them.
- **`notFound()` and `loading.tsx` don't mix across a route's own segment:** a parent segment's `loading.tsx` streams a 200 shell before a *sibling* dynamic route's `notFound()` call can resolve, so that route never gets a real HTTP 404 (found by testing `/colleges/:slug` for a missing college in Phase 5). Fixed by removing `/colleges/loading.tsx` and having `generateMetadata` and the page both call `notFound()` from one memoized fetch — the same pattern `/places/[placeSlug]` uses from the start.
- **No per-request "401 → silent refresh → retry":** `/suggest-a-place` (Phase 8) is the first page that genuinely needs a session to be *used*, not just read for display, and it still doesn't need that interceptor — `SessionProvider` already refreshes once on load, so by the time the form is interactive the access token is valid for its usual lifetime; a token that expires mid-fill surfaces as an ordinary form error instead. The interceptor itself stays deferred until a page needs it.
- **`/suggest-a-place`'s duplicate check is a manual button, not as-you-type:** the original design's live, debounced check is real backend behaviour (`POST /places/duplicate-check`), but the frontend calls it only when "Check for duplicates" is clicked — simpler than debouncing five fields (name, category, address, lat, lng) together, and the server re-checks authoritatively on submit regardless, surfacing the same candidates via a `409` if the button was never clicked.
- **No map picker for `/suggest-a-place`'s coordinates:** latitude/longitude are plain number inputs with a "from Google Maps" hint, matching "no map library yet" above.
- **`sort=nearest` is left out** of the standalone `/colleges` and `/search` sort dropdowns (it needs a geolocation UI not built yet), but **is** the default sort for the places list embedded in a college's own page — there, "nearest" is unambiguous (from that college), no geolocation needed.
- **The college-embedded place list is not URL-synced**, unlike `/colleges` and `/search`: it is a section of a larger page, not a page of its own, so its search/sort/page live in component state only.
- **`/search`'s keyword and price fields commit on submit, not as you type:** unlike `/colleges`' debounced search, this page waits for Enter or a "Search" click before fetching — standard for a dedicated search page, and it sidesteps debouncing three fields (query, min price, max price) independently. The sort dropdown and the verified checkbox still apply immediately.
- **A React Hooks lint rule (`react-hooks/set-state-in-effect`) flags a data-fetching `useEffect` that has *two or more* separate `if (...) { return; }` guards before its "do the fetch" body**, even when neither guard calls `setState` — found while building `/search`'s effect (skip-on-first-render, then skip-if-nothing-to-search), fixed by merging both guards into one `if` block. `/colleges`' simpler effect (only one guard) was never affected. Worth remembering before adding a third guard to either effect.
- Images (`logoUrl`, `coverImageUrl`, gallery) use plain `<img>`, not `next/image`, since no remote-image domains are configured yet.

**Try it locally** (with the API running, `npm run dev -w @platform/web` or the root `npm run dev`):

```bash
open http://localhost:3000/colleges       # or curl -s http://localhost:3000/colleges
open http://localhost:3000/colleges/demo-sample-arts-science-college   # a real "college hub" with real places
open "http://localhost:3000/search?q=mess"
open http://localhost:3000/register
open http://localhost:3000/suggest-a-place   # signed out: a "sign in to continue" prompt; signed in: the form
```

## Testing

```bash
npm test               # unit tests: contracts, api-client, API helpers (no database)
npm run test:e2e       # API end-to-end over HTTP: envelope, errors, validation, CORS, headers, rate limit, Swagger
npm run test:db        # REAL database: connection, migration, all tables, relations, constraints, seed, purge, health API
npm run test:e2e:db    # REAL database, over HTTP: authentication (register -> ... -> logout, reset, roles, permissions, rate limit), the college directory (public browse, staff CRUD, proximity, audit), the category catalogue (public tree, staff CRUD, attributes, rating dimensions, amenities, audit), the place directory (public browse, staff CRUD, categories/amenities/hours/prices, college proximity, audit) and student submissions (duplicate-check, create + server-side block, ownership-scoped reads, staff approve/reject/mark-duplicate, audit)
npm run typecheck && npm run lint
```

`npm test` and `npm run test:e2e` never need XAMPP (they point at an unreachable database on purpose). `npm run test:e2e:db` does need it: authentication creates real rows, so those tests give every account an email under the reserved domain `@auth-e2e.localhost.test` and tag every request with an `e2eauth-` id, and they delete exactly those rows before and after the run. The college and place tests likewise create colleges and places whose slugs start with `e2e-` / `e2e-place-` (each test picks its own spot, far enough apart that they never interfere with each other or with the demo data), and the category tests create categories and amenities whose slugs/keys start with `e2e-cat-` / `e2e_test_`; each suite removes only the rows it made (your seeded data is never touched). **`npm run test:db` needs XAMPP MySQL running, `link_platform` migrated (Step 5) and does not need it seeded.** Every database test runs inside a transaction that is **always rolled back**, so it leaves no data behind and needs no second database; your seeded demo data is never touched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| API exits with `Invalid environment configuration` | `apps/api/.env` is missing or wrong; copy it from `.env.example` |
| `/health/database` returns 503 `DATABASE_UNAVAILABLE` | Read `error.details.reason`: **`SERVER_UNREACHABLE`** → start MySQL in XAMPP and check port `3306`; **`DATABASE_NOT_FOUND`** → create the `link_platform` database (Step 2); **`ACCESS_DENIED`** → fix the user/password in `DATABASE_URL` |
| `Access denied for user 'root'` | Your root user has a password; put it in `DATABASE_URL` (URL-encoded). A default XAMPP root has **no** password: fine for local use, but never expose port 3306 to a network |
| `EADDRINUSE :3001` / `:3000` | Another process uses the port. Stop it, or change `PORT` / the `-p` flag |
| Browser shows a CORS error | Add the web origin to `CORS_ORIGINS` in `apps/api/.env` and restart the API |
| Web page says "Could not reach the server" | The API is not running, or `NEXT_PUBLIC_API_URL` is wrong. Restart the web app after editing `.env.local` |
| `Cannot find module '@platform/contracts'` | Run `npm run build:packages` |
| Port 3306 busy when starting XAMPP MySQL | Another MySQL/MariaDB is running; stop it or change XAMPP's MySQL port (then update `DATABASE_URL`) |
| `Can't reach database server` / `ECONNREFUSED` from a `db:*` command | MySQL is not running: start it in the XAMPP Control Panel |
| `Unknown database 'link_platform'` | Run `npm run db:create`, then `npm run db:migrate` |
| `npm run test:db` cannot connect, or a table is missing | Start XAMPP MySQL and run `npm run db:migrate` first |
| Prisma Studio shows "Could not load schema metadata: `json_arrayagg` does not exist" | Known limitation with XAMPP's MariaDB 10.4; use phpMyAdmin (see [Viewing the data](#viewing-the-data-phpmyadmin-and-prisma-studio)) |
| `npm run db:seed` says it refuses in production | By design: use `npm run db:seed:reference` |
| Registering answers `503 Registration is temporarily unavailable` | The `STUDENT` role is missing: run `npm run db:seed:reference` |
| API refuses to start: `Unsafe production configuration` | In production set real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`; `EMAIL_PROVIDER=console` is development-only and no production provider exists yet |
| No verification email arrives | Development sends nothing: open the API terminal and copy the link printed under `DEV EMAIL` |
| The public `/colleges` list is empty, or a new college returns 404 | Only **ACTIVE** colleges are public: a new one is a DRAFT until you `POST /admin/colleges/:id/activate` |
| `403 FORBIDDEN` on `/admin/colleges` | The account needs the ADMIN or SUPER_ADMIN role (`colleges.manage`); roles are read at sign-in, so sign in again after a role change |
| `429 RATE_LIMITED` while testing locally | Raise `AUTH_RATE_LIMIT` in `apps/api/.env` and restart the API |
| A token/expiry you edited by hand in phpMyAdmin behaves oddly | Timestamps are **UTC**. Use `UTC_TIMESTAMP(3)`, not `NOW()`, which is offset on a non-UTC machine (India: +5:30) |

## Git workflow

- Default branch `main`. Work in short-lived branches (`feat/...`, `fix/...`) and merge when green.
- Conventional commit messages: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **Never commit** `.env` files, passwords, API keys or JWT secrets. `.gitignore` excludes them; only `*.env.example` is tracked.
- Before committing: `npm run typecheck && npm run lint && npm test`.

## Roadmap

| Delivered as | Plan items ([docs/08](docs/08-roadmap.md)) | What | Status |
|---|---|---|---|
| Phase 1 | 1 | Project setup, API foundation, health check | ✅ done |
| Phase 2 | 2, 4 | XAMPP MySQL + Prisma: schema, migration, seed, database health check | ✅ done |
| Phase 3 | 5, 6 | Authentication, JWT, email verification, RBAC guards, audit service | ✅ done |
| Phase 4 | 7 | Colleges: public directory, staff management, proximity links | ✅ done |
| Phase 5 | 8, 17–18 (slice) | Categories, attributes, rating dimensions, amenities; a frontend foundation (session, primitives, auth pages, college directory) | ✅ done |
| Phase 6 | 9, 17–18 (slice) | Places: public directory, staff management, categories/amenities/hours/prices, college proximity; frontend: a public place-detail page and a working college hub | ✅ done |
| Phase 7 | 10 (Places-scoped), 17–18 (slice) | Full-text place search (MySQL `FULLTEXT`, relevance ranking), price/verified filters; frontend: a working `/search` page | ✅ done |
| Phase 8 | 11 (narrowed), 17–19 (slice) | Student submissions + duplicate detection (name/geo/category/address/phone scoring), staff approve/reject/mark-duplicate; frontend: a working "Suggest a place" flow | ✅ done |
| next | — | 10's remaining scope (cross-entity `/search`, autocomplete, analytics) and 11's remaining scope (contributions, request-changes loop, abuse quotas) fold into whichever later phase needs them | |
| 12–16 | Business owner, claims, reviews, reports, saved places | |
| 17–21 | Public website, student discovery, business + admin dashboards (foundation slice delivered early) | |
| 22–23 | Integration testing, performance + security review | |

Full plan with exit criteria: [docs/08-roadmap.md](docs/08-roadmap.md).
