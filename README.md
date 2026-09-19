# Student Ecosystem Platform (working name: LINK)

Everything a student needs around their college: rooms, PGs, hostels, messes, libraries, gyms, laundry, transport and more, discoverable by college, verified by staff, contributed to by students and maintained by business owners.

> **Status: Phases 1–2 of 23 complete** (project setup, then the XAMPP MySQL + Prisma database: schema, migration, seed and health check). Authentication and the product features arrive in the following phases (see [Roadmap](#roadmap)).

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
│  │  │  └─ modules/        feature modules (health today; auth, colleges, places, ... next)
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

**32 tables**, all created by the `initial_schema` migration:

| Area | Tables |
|---|---|
| Users and access | `users`, `roles`, `permissions`, `role_permissions`, `user_roles` |
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

## Testing

```bash
npm test               # unit tests: contracts, api-client, API helpers (no database)
npm run test:e2e       # API end-to-end over HTTP: envelope, errors, validation, CORS, headers, rate limit, Swagger
npm run test:db        # REAL database: connection, migration, all tables, relations, constraints, seed, purge, health API
npm run typecheck && npm run lint
```

`npm test` and `npm run test:e2e` never need XAMPP (they point at an unreachable database on purpose). **`npm run test:db` needs XAMPP MySQL running, `link_platform` migrated (Step 5) and does not need it seeded.** Every database test runs inside a transaction that is **always rolled back**, so it leaves no data behind and needs no second database; your seeded demo data is never touched.

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

## Git workflow

- Default branch `main`. Work in short-lived branches (`feat/...`, `fix/...`) and merge when green.
- Conventional commit messages: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **Never commit** `.env` files, passwords, API keys or JWT secrets. `.gitignore` excludes them; only `*.env.example` is tracked.
- Before committing: `npm run typecheck && npm run lint && npm test`.

## Roadmap

| # | Phase | Status |
|---|---|---|
| 1 | Project setup, API foundation, health check | ✅ done |
| 2 | XAMPP MySQL + Prisma: schema, migration, seed, database health check | ✅ done |
| 3 | NestJS foundation (rest): cache, events, audit, module skeletons | next |
| 4 | Migrations + seed | ✅ delivered in Phase 2 |
| 5–6 | Authentication, roles + authorization | |
| 7–10 | Colleges, categories, places, search + filters + distance | |
| 11–16 | Submissions + duplicate detection, business owner, claims, reviews, reports, saved places | |
| 17–21 | Next.js foundation, public website, student discovery, business + admin dashboards | |
| 22–23 | Integration testing, performance + security review | |

Full plan with exit criteria: [docs/08-roadmap.md](docs/08-roadmap.md).
