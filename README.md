# Student Ecosystem Platform (working name: LINK)

Everything a student needs around their college: rooms, PGs, hostels, messes, libraries, gyms, laundry, transport and more, discoverable by college, verified by staff, contributed to by students and maintained by business owners.

> **Status: Phase 1 of 23 (project setup) complete.** The API foundation, the web app shell and the web ↔ API connection work. The database schema, authentication and the product features arrive in the following phases (see [Roadmap](#roadmap)).

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
│  │  ├─ prisma/            schema.prisma (+ migrations/ and seed/ from Phase 2/4)
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

Prisma creates the *tables* (Phase 2), but the empty *database* must exist first. Use either option once:

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

> **Note:** XAMPP's "MySQL" module is actually **MariaDB**. Prisma's `mysql` provider works with it. The compatibility details are verified in Phase 2 (see `docs/01-analysis-and-risks.md`, risk T13).

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

### Step 5: Run database migrations *(Phase 2, not available yet)*

### Step 6: Seed the database *(Phase 4, not available yet)*

### Step 7: Start the API

```bash
npm run build:packages     # once, and again after changing packages/*
npm run dev:api
```

- API: `http://localhost:3001/api/v1`
- Health check: `http://localhost:3001/api/v1/health`
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
| `npm run test:e2e` | API end-to-end tests (boot the real app, call it over HTTP) |
| `npm run format` / `format:check` | Prettier |

API-only (inside `apps/api`, or `npm run <script> -w @platform/api`): `prisma:generate`, `start` (run the production build).

## Prisma

Phase 1 wires Prisma to MySQL/XAMPP (`apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`). The relational model and migrations arrive in Phase 2, so today only client generation applies:

```bash
npm run prisma:generate -w @platform/api      # generates apps/api/src/generated/prisma (git-ignored)
```

Prisma 7 needs a driver adapter; the API uses `@prisma/adapter-mariadb`, which also serves XAMPP's MariaDB. `GET /api/v1/health/database` runs `SELECT VERSION()` so you can confirm the API can reach MySQL at any time.

Coming in Phase 2: `prisma validate`, `prisma migrate dev`, `prisma migrate status`, `prisma studio`. Coming in Phase 4: `prisma db seed`.

## Testing

```bash
npm test               # unit tests: contracts, api-client, API config/validation helpers
npm run test:e2e       # API e2e: envelope, errors, validation, CORS, security headers, rate limit, Swagger
npm run typecheck && npm run lint
```

The API e2e tests boot the real NestJS app. In Phase 1 they deliberately point at an unreachable database port so they do not depend on XAMPP; from Phase 2 database-backed tests use a separate `link_platform_test` database in XAMPP.

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

## Git workflow

- Default branch `main`. Work in short-lived branches (`feat/...`, `fix/...`) and merge when green.
- Conventional commit messages: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **Never commit** `.env` files, passwords, API keys or JWT secrets. `.gitignore` excludes them; only `*.env.example` is tracked.
- Before committing: `npm run typecheck && npm run lint && npm test`.

## Roadmap

| # | Phase | Status |
|---|---|---|
| 1 | Project setup, API foundation, health check | ✅ done |
| 2 | XAMPP MySQL + Prisma schema and migration | next |
| 3–4 | NestJS foundation (rest), migrations + seed | |
| 5–6 | Authentication, roles + authorization | |
| 7–10 | Colleges, categories, places, search + filters + distance | |
| 11–16 | Submissions + duplicate detection, business owner, claims, reviews, reports, saved places | |
| 17–21 | Next.js foundation, public website, student discovery, business + admin dashboards | |
| 22–23 | Integration testing, performance + security review | |

Full plan with exit criteria: [docs/08-roadmap.md](docs/08-roadmap.md).
