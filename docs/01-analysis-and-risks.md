# 01 · Requirements analysis, decisions & risks

Answers spec §62 items **1** (analyse) and **2** (missing decisions, technical risks).

## 1. What the spec actually asks for

A three-sided local-discovery platform: **students** (demand), **businesses** (supply and future revenue), **staff** (trust). The code is not the moat. **Dense, fresh, verified local data** and **trust** are. Three loops must work end to end, and every design choice below serves one of them:

| Loop | Flow | Failure mode if neglected |
|---|---|---|
| **Discovery** | pick college → browse/search/filter → save / call / navigate | empty or stale pages; students never return |
| **Contribution** | suggest / correct / confirm → duplicate check → moderation → live | duplicate spam; moderation backlog; contributors ignored |
| **Ownership** | owner lists or claims → verification → owner maintains → leads/analytics | fake claims; owners churn because every edit needs approval |

## 2. MVP cut (Phase 1)

| Area | In Phase 1 | Deferred |
|---|---|---|
| Auth | email register / verify / login / refresh / forgot / reset, RBAC, account status | phone OTP (schema-ready), staff 2FA (**before public launch**, Phase 1.5), social login |
| Catalogue | cities, colleges, dynamic categories + attributes + amenities + rating dimensions (admin CRUD) | category-level SEO copy tooling |
| Places | full lifecycle, prices, hours, images, amenities, attributes, college↔place proximity | interactive browse-map, compare places |
| Discovery | college picker, college hub, category listing + filters + sorts, detail, search (places/colleges/categories/businesses), saves | marketplace search (Phase 2) |
| Contribution | suggest a place, duplicate detection, contributions (edit / photo / confirm) | contributor reputation, auto-approval tiers |
| Business | profile, listings (draft → submit), claims, leads (enquiry form), review replies, basic analytics | promotions/billing, team invites (data model ready) |
| Trust | reviews, reports, moderation queues, audit log | ML/automated moderation |
| Admin | dashboard, colleges, categories, places, businesses, students, submissions, contributions, claims, reviews, reports, imports, audit logs, settings, staff | Marketplace / Community / Advertisements sections **hidden**, not stubbed |
| Notifications | in-app + email (outbox) | push (schema + channel ready), preferences UI |
| Offers | moderated offers (late Phase 1; Home rail hidden until ≥1 live offer) | promoted/sponsored offers |
| i18n | scaffolding (`next-intl`, message keys, machine-readable error codes) | Marathi / Hindi content (decision D5) |
| Later phases | | Marketplace (P2), Community (P3), Ads & subscriptions (P4), React Native app (after web API stabilises) |

## 3. Deliberate deviations from the spec (please confirm)

| # | Spec says | Plan does | Why |
|---|---|---|---|
| 1 | `POST /api/v1/places` for a student's suggestion | Students/owners use `POST /place-submissions` (202). `POST /places` is staff-only (201) | One endpoint with a role-dependent outcome is hard to document, test and consume from mobile. |
| 2 | Separate `review_reports`, `marketplace_reports` | One `reports` table with `target_type` | One moderation queue, one code path; marketplace/community add **no** new report tables. Trade-off: no DB foreign key on target → integrity enforced in service. |
| 3 | `place_submissions` as a payload store | Place **data** lives in `places` (`DRAFT` / `PENDING_REVIEW`); `place_submissions` is the **workflow record** (who, when, duplicates found, decision) | One editor, one validation path, one image pipeline. Patches (`place_contributions`) are only needed where the target row is already live. |
| 4 | Entity list in §33 | Adds `cities`, `college_places`, `media_assets`, `slug_redirects`, `auth_tokens`, `refresh_tokens`, `student_profiles`, `review_replies`, `leads`, `offers`, `outbound_messages`, `analytics_events`, `daily_stats`, `app_settings`, `device_tokens` | Each is justified in [03-database](03-database.md). |
| 5 | "Price information" as a field | `place_price_options` rows + denormalised `price_min/max/unit` on `places` | Messes and PGs have several price points; sorting/filtering needs one comparable number. |
| 6 | Build order | ~~UI slice right after the discovery API~~ (my suggestion, **withdrawn**) | You specified a 23-phase backend-first order; it is followed as written ([08](08-roadmap.md)). |
| 7 | Distance "calculated from coordinates" | Calculated **once** into `college_places.distance_m`, recomputed on change | Preserves "never manually entered" while making distance sorting an indexed read. |

## 4. Missing decisions and recommended defaults

| ID | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | What does "Verified" mean? | Three levels: `NONE` (approved, unchecked), `OWNER_CLAIMED` (owner proved control), `VERIFIED` (staff confirmed by call/visit; shows green badge + "last verified" date). | "Approved" ≠ "verified". The badge is the trust asset; if it is handed out loosely it is worthless. |
| D2 | Can owners edit live listings without re-approval? | Tiered: low-risk fields (hours, phone, price options, amenities, description) apply instantly and enter a post-review feed; high-risk (name, category, location, ownership) and **photos** queue for review. | Spec forbids bypassing moderation, but re-approving every price change makes owners abandon the product. |
| D3 | Who moderates and how fast? | Places / claims / contributions pre-moderated (target 48 h). Reviews publish immediately with post-moderation. No auto-approval in Phase 1. | One overwhelmed admin is the most likely operational failure. |
| D4 | Minors and privacy law | Many Ahilyanagar colleges include junior (11th–12th) sections, so some users are under 18. India's DPDP Act, 2023 treats under-18s as children (verifiable parental consent; no tracking, behavioural monitoring or targeted ads aimed at children). Recommend: browsing needs no account; account creation 18+ initially, or get counsel's view on a parental-consent flow; keep analytics non-behavioural regardless. Also plan IT Rules 2021 intermediary basics: ToS, privacy policy, grievance officer, takedown workflow. **This is not legal advice; needs review before public launch.** | Affects registration fields, analytics design and future ad targeting. |
| D5 | Languages | Build i18n scaffolding now (cheap), ship English, add Marathi after the pilot. DB is `utf8mb4` so Devanagari names work from day one. | Retrofitting i18n later is expensive; translating early is not. |
| D6 | Map provider for the location picker | `MapLibre GL` + a hosted tile provider with a free tier (MapTiler / Stadia, or self-hosted Protomaps later). Picker options: pin-drop, "use my location", paste full Google Maps link (client-side parse). **"Open in Google Maps" needs no API key** (Maps URLs). | "Suggest a Place" and staff place creation need a way to capture coordinates. No Google scraping or caching. |
| D7 | Hosting region | India region (AWS `ap-south-1`, Mumbai) preferred for latency and data-residency comfort. Verify current regions at Railway/Render before choosing. Managed MySQL must support FULLTEXT and foreign keys, so avoid Vitess-based hosts. Render has no managed MySQL as far as I know (verify). | Latency to Indian users; portability. |
| D8 | Domain, brand, sending domain | Register a domain before staging: needed for same-site cookies (`app.` + `api.`), SPF/DKIM/DMARC, OG URLs. "LINK" is generic: check trademark and domain availability. Brand lives in one config file. | Cross-site cookies break in Safari/Chrome; email lands in spam without DNS auth. |
| D9 | Contact visibility | Phone/WhatsApp shown after sign-in (tap-to-reveal, logged as lead intent). Business email never shown. | Deters scraping, feeds the registration loop, produces lead data for owners. |
| D10 | Who can review | Email-verified students only, one review per place per user, cannot review own business; optional opt-in "student of X College" chip. | Basic fake-review resistance without heavy KYC. |
| D11 | Who collects the verified seed data | Founder and volunteers via CSV templates ([09](09-env-and-seed.md)); each row carries `data_source`, `verified_by`, `last_verified_at`. **Density gate:** ≥ 8 verified places in each of the top 6 categories before a college is promoted. | Cold-start density is the #1 product risk. |
| D12 | Package manager | npm workspaces (already installed; Expo-friendly). Turborepo can be added later if builds slow down. | pnpm is not installed; fewer moving parts. |
| D13 | Validation approach | **Resolved:** shared `zod` schemas in `@platform/contracts` validated by NestJS 12's built-in `StandardSchemaValidationPipe`; Swagger documents the same schemas through its `standardSchemaConverter`. `nestjs-zod` is **not** used (it does not yet support Nest 12). Verified in a spike during Phase 1. | One schema drives API validation, API docs, web forms, mobile forms and types; no duplicated rules. |
| D14 | Build order | **Withdrawn.** The backend-first 23-phase order you specified is followed. | |

## 5. Technical risks

| ID | Risk | L / I | Mitigation |
|---|---|---|---|
| T1 | **Geo queries in MySQL/Prisma**: no native spatial type in Prisma; a two-column range index handles only one range well. | M / M | Precompute `college_places.distance_m` (indexed). Ad-hoc "near me" and duplicate checks always scope by `city_id` first, then bounding box, then Haversine via a `$queryRaw` tagged template. Add a geohash/generated `POINT` column only if profiling demands. |
| T2 | **MySQL FULLTEXT weaknesses**: whole-word tokens, weak typo tolerance, poor Indic transliteration matching. | H / M | `SearchProvider` interface; indexed prefix match on `name_normalized` for autocomplete; staff-managed `search_keywords` synonyms ("khanawal", "tiffin dabba"); zero-result query log reviewed weekly; OpenSearch triggers defined in [02](02-architecture.md#8-scalability-decisions-and-growth-triggers). |
| T3 | **Duplicate detection quality** on transliterated names ("Krupa"/"Kripa"), common tokens ("Sai", "Shree"). | H / H | IDF-weighted token similarity + Indic-aware normalisation + geo + category + phone signals; thresholds in `app_settings`; a labelled fixture set built from seed data; humans decide in the gray zone. |
| T4 | **Prisma/MySQL limits**: no partial unique indexes, no declarative CHECK, limited JSON filtering, shadow DB needed by managed hosts. | H / L | Hand-written SQL sections inside migrations (CHECKs, generated-column unique for "one pending claim per place+business"); `$queryRaw` only via tagged templates; lint bans `$queryRawUnsafe`. |
| T5 | **Cookie/CORS in production**: Vercel and Railway default domains are different sites, so the refresh cookie is third-party and gets blocked. | H / H | Custom domain from day one (`app.` / `api.` under one registrable domain). Preview deployments use a Next.js rewrite proxy. Documented in [02](02-architecture.md#51-auth--sessions). |
| T6 | **Scale-out breaks in-memory throttling and cache** the moment a second API instance starts. | M / M | `CachePort` and throttler storage are abstractions; Redis is added when instances > 1. Documented trigger. |
| T7 | **Stale data** (prices change every admission season). | H / H | `last_verified_at` shown on cards; staleness job asks owners/staff to re-confirm after 6 months; owners get a seasonal reminder. |
| T8 | **Image cost and performance** (free-tier limits, on-the-fly transformations). | M / M | Strict upload limits, `f_auto,q_auto`, fixed transformation presets, `next/image` loader, lazy loading. `StorageProvider` allows S3 + CDN later. |
| T9 | **SEO with a decoupled API**: ISR pages go stale when data changes. | M / M | Tag-based revalidation: domain event `place.changed` → signed webhook → `revalidateTag`. Best-effort, retried through the outbox. |
| T10 | **Monorepo deploys**: Vercel and Railway/Render need workspace-aware builds; migrations must not run at app boot. | M / L | `apps/web` root dir on Vercel; API built from a multi-stage Dockerfile; `prisma migrate deploy` as an explicit release step. |
| T11 | **Windows dev environment**: XAMPP for MySQL, CRLF line endings, file locks from antivirus during `npm install`. | H / L | `.gitattributes` enforcing LF; retry-friendly install settings documented in the README; tests avoid mocks where a real database matters. |
| T12 | **Version drift**: Next/React/Tailwind/Prisma/Nest move fast. | M / L | Install current stable at Step 2, record versions, re-check breaking changes (e.g. Prisma driver adapters, `uuid(7)` support, multi-file schema GA) before writing code. |
| T13 | **XAMPP's "MySQL" is MariaDB 10.4.32** (verified on this machine; EOL upstream). Differences that affect this design: `JSON` is an alias for `LONGTEXT` (Prisma migration drift possible), no `FOR UPDATE SKIP LOCKED` (added in 10.6), no MySQL-8-only collations such as `utf8mb4_0900_ai_ci`. Prisma 7 also has to accept a 10.4 server. | H / M | Verify in **Phase 2** by actually migrating and querying. Keep SQL portable (outbox rows are claimed with a plain `UPDATE ... WHERE status = PENDING` plus a lock token, not `SKIP LOCKED`). Prefer `utf8mb4_unicode_ci`. Run CI against MySQL 8.4. Recommend upgrading the local MariaDB or matching production to MySQL 8.4 / MariaDB 11 LTS. |

## 6. Product, business and legal risks

| ID | Risk | Mitigation |
|---|---|---|
| P1 | **Cold start.** An empty city page loses students permanently. | Field-collect first, density gate per college, launch one college, then expand. Suggest-a-Place CTA on every empty state. |
| P2 | **Moderation bandwidth.** | Queues ranked by signal (distinct reporters, duplicate score, submitter history); reviews are post-moderated; SLA targets; staff tooling built before launch, not after. |
| P3 | **Fake claims and competitor sabotage** (false claims, mass-reported reviews). | Claim verification by calling the listed number; competing claims resolved by staff; owners can't delete reviews; auto-hide only for spam/inappropriate at ≥ 3 distinct reporters, never for factual disputes. |
| P4 | **Seasonality.** Rooms/PG demand peaks around admissions (roughly June–August; verify with local colleges). | Aim for a pilot before the season and public launch ahead of the next one (mid-2027). |
| P5 | **Monetisation vs. student trust.** | Free basic listings and free student side; sponsored placements always labelled; no paid rank inside verified/rating sorts. |
| P6 | **Legal exposure**: DPDP (minors, consent for sharing contact with businesses), IT Rules (grievance officer), defamation risk in reviews. | D4; consent captured on enquiry (`leads.consent_at`); takedown process; ToS reviewed by counsel. |
| P7 | **Brand/trademark** conflicts with a generic name. | Config-driven brand, neutral `@platform/*` package scope. |
| P8 | **Scope.** The spec is roughly two years of roadmap. | Hard MVP cut (§2), phase gates in [08](08-roadmap.md). |

## 7. Sizing assumptions (design targets)

| | Pilot | Ahilyanagar-wide | National horizon |
|---|---|---|---|
| Colleges | 1–3 | ≤ 50 | ~5,000 |
| Places | ≤ 500 | ≤ 10,000 | ~500,000 |
| Users | ≤ 5,000 | ≤ 50,000 | ~10,000,000 |

These are planning assumptions, not measurements. The architecture should need **no rewrite** up to the middle column and **no re-platforming** (only the evolutions listed in [02 §8](02-architecture.md#8-scalability-decisions-and-growth-triggers)) toward the right column.
