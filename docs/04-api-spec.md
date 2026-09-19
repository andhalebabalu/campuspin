# 04 · API specification (`/api/v1`)

Answers spec §62 item **5** (API module structure) in detail. Every endpoint here is mobile-ready: no cookies-only behaviour, no HTML, no Next.js-specific assumptions.

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `{API_BASE_URL}/api/v1`. JSON only (multipart for uploads). UTF-8. Timestamps ISO-8601 UTC. IDs are UUIDs. Public resources are addressable by `:idOrSlug`. |
| Auth | `Authorization: Bearer <accessToken>`. Send `X-Client: web / android / ios` and `X-App-Version`. |
| Versioning | Additive changes only inside `v1`; breaking changes → `/v2` with a deprecation window. `GET /meta/client-config` returns min supported app version, feature flags and maintenance banner. |
| Pagination | `page` (default 1) and `limit` (default 20, **max 50**). Lists return `meta`. Cursor variants are added additively for feeds later. |
| Sorting | `sort=` from a **whitelist** per endpoint; unknown values → `400`. |
| Filtering | Flat query params. Arrays are comma-separated (`categorySlug=mess,pg`). Attribute filters: `attr.diet=veg`, `attr.ac=true`. |
| Caching | Public GETs are **user-agnostic**: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` + ETag. `/me/*` and `/admin/*` are `no-store`. Per-user overlays (e.g. saved ids) come from `/me`. |
| Idempotency | `PUT` / `DELETE` idempotent. Duplicate prevention for `POST` relies on unique constraints (review, save) and duplicate detection (submission). `Idempotency-Key` header planned for Phase 1b (submissions, reviews, leads). |
| Rate limits | Global default plus stricter buckets for auth, uploads, submissions, reports. `429` includes `Retry-After`. |
| Docs | Swagger UI at `/api/docs` (disabled or protected in production); JSON at `/api/docs-json`. |

### Success envelope

```json
{
  "success": true,
  "data": {},
  "message": "Success",
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
}
```

`meta` appears only on lists.

### Error envelope

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": { "fields": { "email": ["Invalid email address"] } }
  },
  "requestId": "0195f0e2-7c1a-7c3e-9d2b-3f1d5a0b9c11"
}
```

`message` is human-readable English for logs and fallbacks; clients localise from `error.code`. `error.details` is an object. For `VALIDATION_ERROR` it is `{ fields: { "<dotted.path>": ["message", ...] } }`, and problems with the whole body are filed under `_root`. `requestId` is also returned in the `X-Request-Id` header.

### Status codes

| Code | Use |
|---|---|
| 200 / 201 | OK / created |
| 202 | accepted for asynchronous or moderated processing (register, forgot password, submission) |
| 204 | no content (logout, delete) |
| 400 | validation failure |
| 401 | missing/invalid/expired access token |
| 403 | authenticated but not permitted (role, ownership, account state) |
| 404 | not found (also used instead of 403 to avoid revealing private resources) |
| 409 | conflict (e.g. `DUPLICATE_PLACE_SUSPECTED`, already reviewed) |
| 413 / 415 | upload too large / unsupported type |
| 429 | rate limited |
| 5xx | unexpected; body still uses the error envelope |

### Error codes (initial catalogue)

`VALIDATION_ERROR` · `AUTH_INVALID_CREDENTIALS` · `AUTH_EMAIL_NOT_VERIFIED` · `AUTH_TOKEN_EXPIRED` · `AUTH_TOKEN_INVALID` · `AUTH_REFRESH_REUSED` · `ACCOUNT_SUSPENDED` · `FORBIDDEN` · `NOT_FOUND` · `CONFLICT` · `DUPLICATE_PLACE_SUSPECTED` · `ALREADY_REVIEWED` · `CLAIM_ALREADY_PENDING` · `PLACE_ALREADY_CLAIMED` · `QUOTA_EXCEEDED` · `UPLOAD_INVALID_TYPE` · `UPLOAD_TOO_LARGE` · `RATE_LIMITED` · `INTERNAL_ERROR`

### Representative response shape: `PlaceCard`

Used by list, search, home rails and (unchanged) by the mobile app. The detail response extends it.

```json
{
  "id": "0195…", "slug": "abc-mess", "name": "ABC Mess",
  "primaryCategory": { "id": "…", "slug": "mess", "name": "Mess", "icon": "utensils" },
  "coverImage": { "url": "https://…", "alt": "ABC Mess dining hall", "width": 1200, "height": 800 },
  "locality": "Savedi",
  "distanceM": 850, "walkMinutes": 11,
  "rating": { "avg": 4.4, "count": 37 },
  "price": { "from": 3000, "to": 3500, "unit": "MONTH", "label": "₹3,000–3,500 / month" },
  "verification": { "level": "VERIFIED", "lastVerifiedAt": "2026-08-30T00:00:00.000Z" },
  "operatingStatus": "OPEN", "isOpenNow": true, "nextChange": { "at": "2026-09-19T15:00:00.000Z", "state": "CLOSES" },
  "highlights": [ { "label": "Diet", "value": "Veg" }, { "label": "Meals", "value": "Lunch, Dinner" } ],
  "amenities": [ { "key": "wifi", "label": "WiFi", "icon": "wifi" } ],
  "isFeatured": false, "isDemo": false
}
```

`distanceM` and `walkMinutes` are present when a `collegeId` (or `lat`/`lng`) context is supplied. `isOpenNow` is `null` when hours are unknown.

## 2. Endpoints

**Access column:** `Public` · `Auth` (signed-in, email verified) · `Role: X` · `Perm: x.y` (staff permission, see [07-rbac](07-rbac.md)) · `Own` (resource policy).

### 2.1 Auth: `/auth`

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | Public | Body: `role` (`STUDENT` or `BUSINESS_OWNER`), name, email, password; student: `collegeId`, `course`, `yearOfStudy`. Always `202`. |
| POST | `/auth/verify-email` | Public | `{ token }` → `200`. |
| POST | `/auth/resend-verification` | Public | `{ email }` → `202`; throttled. |
| POST | `/auth/login` | Public | Returns `accessToken`, `expiresIn`, `user`; refresh via cookie (web) or body (mobile). |
| POST | `/auth/refresh` | Public (refresh credential) | Rotates; reuse of an old token revokes the family. |
| POST | `/auth/logout` | Auth | Revokes current session. `204`. |
| POST | `/auth/logout-all` | Auth | Revokes all sessions. |
| POST | `/auth/forgot-password` | Public | `202`, generic. |
| POST | `/auth/reset-password` | Public | `{ token, newPassword }`; revokes all sessions. |
| POST | `/auth/change-password` | Auth | `{ currentPassword, newPassword }`. |
| GET | `/auth/sessions` | Auth | Device list (Phase 1b). |
| DELETE | `/auth/sessions/:id` | Auth | Revoke one device (Phase 1b). |
| POST | `/auth/otp/request`, `/auth/otp/verify` | reserved | Phone OTP (future); path reserved, not implemented. |

### 2.2 Me: `/me`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/me` | Auth | Profile, roles, student profile, business memberships. |
| PATCH | `/me` | Auth | name, avatar, locale. |
| PATCH | `/me/student-profile` | Role: STUDENT | college, course, year. Emits `COLLEGE_SELECTED`. |
| DELETE | `/me` | Auth | Requests account deletion (soft-delete → anonymise). |
| GET | `/me/saved-places` | Auth | Paginated `PlaceCard`s. |
| GET | `/me/saved-place-ids` | Auth | Ids only, for client-side overlay on cached public lists. |
| GET | `/me/reviews` | Auth | Own reviews with status. |
| GET | `/me/submissions` | Auth | Own suggestions with status and reviewer note. |
| GET | `/me/contributions` | Auth | Own edits/photos/confirmations. |
| GET | `/me/notifications` | Auth | Paginated; `?unread=true`. |
| POST | `/me/notifications/read` | Auth | `{ ids? }` (all if omitted). |
| POST | `/me/devices` | Auth | Register push token (mobile; Phase 1b). |
| DELETE | `/me/devices/:id` | Auth | |

### 2.3 Cities and colleges

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/cities` | Public | Launched cities. |
| GET | `/colleges` | Public | `q`, `cityId`, `lat`, `lng`, `sort` (`popular`, `nearest`, `name`), page. Card: logo, name, city, `placeCount`, `popularCategories[]`. |
| GET | `/colleges/popular` | Public | Curated/popular list for the picker. |
| GET | `/colleges/:idOrSlug` | Public | Detail with cover, images, counts. |
| GET | `/colleges/:idOrSlug/categories` | Public | Category tree with live place counts for this college (drives category shortcuts). |
| GET | `/colleges/:idOrSlug/discover` | Public | One-round-trip home payload: `nearby`, `popular`, `topRated`, `recentlyAdded`, `offers`. |
| POST / PATCH | `/admin/colleges`, `/admin/colleges/:id` | Perm: `college.manage` | Create/edit; changes to coordinates/radius trigger proximity recompute. |
| POST | `/admin/colleges/:id/verify` | Perm: `college.manage` | |
| POST | `/admin/colleges/:id/deactivate`, `/activate` | Perm: `college.manage` | Soft only. |
| GET / POST / PATCH | `/admin/cities`, `/admin/cities/:id` | Perm: `college.manage` | |

### 2.4 Categories and amenities

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/categories` | Public | `scope=PLACE` default. Tree of groups → categories (icon, slug, order). |
| GET | `/categories/:idOrSlug` | Public | Adds `attributes[]`, `ratingDimensions[]`, `amenities[]`, and a **`filters[]` descriptor** the UI renders generically. |
| GET | `/amenities` | Public | |
| POST / PATCH | `/admin/categories`, `/admin/categories/:id` | Perm: `category.manage` | Deactivate instead of delete when in use. |
| POST / PATCH / DELETE | `/admin/categories/:id/attributes[/:attrId]` | Perm: `category.manage` | |
| POST / PATCH / DELETE | `/admin/categories/:id/rating-dimensions[/:dimId]` | Perm: `category.manage` | |
| POST / PATCH | `/admin/amenities[/:id]` | Perm: `category.manage` | |

### 2.5 Places

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/places` | Public | **List/search/filter.** Params: `collegeId` or `collegeSlug`, `categoryId` or `categorySlug` (multi), `q`, `lat`+`lng`, `radiusM`, `minPrice`, `maxPrice`, `minRating`, `verified`, `openNow`, `amenities` (keys), `attr.*`, `sort` (`distance`, `price_asc`, `price_desc`, `rating`, `newest`, `relevance`), page. Returns `PlaceCard[]`. |
| GET | `/places/:idOrSlug` | Public | Full detail. `?collegeId=` adds distance from that college; returns all related colleges with distances. Phone/WhatsApp are omitted when unauthenticated (D9); response flags `contactRequiresLogin`. |
| GET | `/places/:id/reviews` | Public | Paginated; `sort` (`recent`, `highest`, `lowest`). |
| POST | `/places/:id/reviews` | Role: STUDENT | One per user per place; not the place's own business. `201`. |
| PATCH / DELETE | `/reviews/:id` | Own | Edit / withdraw own review. |
| POST | `/places/:id/report` | Auth | `{ reason, details? }`. |
| POST | `/places/:id/save` | Auth | Idempotent save. |
| DELETE | `/places/:id/save` | Auth | Idempotent unsave. |
| POST | `/places/:id/contributions` | Role: STUDENT | Suggest edit / photo / price / hours / confirmation. `202`. |
| POST | `/places/:id/claims` | Role: BUSINESS_OWNER | `{ businessId, message, contactPhone, evidenceMediaIds[] }`. `409 PLACE_ALREADY_CLAIMED` if owned. |
| POST | `/places/:id/leads` | Role: STUDENT | Enquiry with explicit consent flag. |
| POST | `/places/duplicate-check` | Auth | `{ name, categoryId, latitude, longitude, address?, phone? }` → `{ candidates:[{ place, score, level, reasons[] }] }`. |
| POST | `/places` | Perm: `place.create` | **Staff only.** Creates directly; `201`. |
| PATCH | `/places/:id` | Perm: `place.update` or Own | Replace-by-collection semantics for `prices[]`, `hours[]`, `amenityKeys[]`, `attributes{}`, `imageIds[]`. Owner edits return `{ applied[], queuedForReview[] }` per D2. |

### 2.6 Suggestions (submissions)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/place-submissions` | Role: STUDENT | Creates the `PENDING_REVIEW` place + submission. Server re-runs duplicate detection. `202`; `409 DUPLICATE_PLACE_SUSPECTED` when the score ≥ block threshold and no explicit "different place" justification was sent. |
| GET | `/place-submissions/:id` | Own | Status, reviewer note, candidates shown. |
| PATCH | `/place-submissions/:id` | Own | Edit while `PENDING` / `NEEDS_CHANGES`; resubmits after changes. |
| DELETE | `/place-submissions/:id` | Own | Withdraw. |

### 2.7 Businesses, listings, leads

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/businesses` | Role: BUSINESS_OWNER | Create profile; creator becomes `OWNER`. |
| GET | `/businesses/mine` | Role: BUSINESS_OWNER | |
| GET / PATCH | `/businesses/:id` | Own (member) | |
| GET | `/businesses/:id/places` | Own (member) | All statuses. |
| POST | `/businesses/:id/places` | Own (member) | Creates a `DRAFT` listing. |
| PATCH | `/businesses/:id/places/:placeId` | Own (member) | Draft: free edit. Live: tiered per D2. |
| POST | `/businesses/:id/places/:placeId/submit` | Own (member) | `DRAFT → PENDING_REVIEW`; creates a submission. `202`. |
| GET | `/businesses/:id/leads` | Own (member) | `?status=`. |
| PATCH | `/leads/:id` | Own (member) | Update status. |
| GET | `/businesses/:id/reviews` | Own (member) | Reviews of the business's places. |
| POST | `/reviews/:id/reply` | Own (member) | One reply per review. |
| GET | `/businesses/:id/analytics` | Own (member) | `?range=7d, 30d, 90d`: views, saves, leads, directions/call clicks, rating trend, from `daily_stats`. |
| GET | `/businesses/:id/claims` | Own (member) | Claim statuses. |
| POST / DELETE | `/businesses/:id/members[/:userId]` | Own (owner) | Team invites (Phase 1b). |
| GET | `/businesses/:idOrSlug/public` | Public | Public business profile (search hit target). |

### 2.8 Offers (Phase 1b)

| Method | Path | Access |
|---|---|---|
| GET | `/colleges/:idOrSlug/offers` | Public |
| POST / PATCH | `/businesses/:id/places/:placeId/offers[/:offerId]` | Own (member); creates `PENDING_REVIEW` |
| GET / POST | `/admin/offers`, `/admin/offers/:id/(approve, reject)` | Perm: `offer.moderate` |

### 2.9 Search

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/search` | Public | `q`, `types` (`places,colleges,categories,businesses,marketplace`), `collegeId`, `limit` per type. Grouped results. |
| GET | `/search/suggest` | Public | Lightweight autocomplete (names + type only), rate-limited. |

### 2.10 Reports

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/reports` | Auth | Generic: `{ targetType, targetId, reason, details? }` (`/places/:id/report` and `/reviews/:id/report` are convenience aliases). |
| GET | `/admin/reports` | Perm: `report.review` | Filters: `status`, `targetType`, `reason`; sorted by signal. |
| GET | `/admin/reports/:id` | Perm: `report.review` | Includes target snapshot and other reports on the same target. |
| POST | `/admin/reports/:id/assign` | Perm: `report.review` | |
| POST | `/admin/reports/:id/resolve` | Perm: `report.review` | `{ action, note }`; `action` is target-specific (e.g. `HIDE_REVIEW`, `SUSPEND_PLACE`, `MARK_CLOSED`, `NO_ACTION`). |
| POST | `/admin/reports/:id/dismiss` | Perm: `report.review` | |

### 2.11 Uploads

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/uploads/images` | Auth | multipart `file` + `purpose` (`PLACE`, `REVIEW`, `COLLEGE`, `AVATAR`, `CLAIM_EVIDENCE`). Returns `{ mediaAssetId, url, width, height }`. |
| DELETE | `/uploads/:id` | Own | Only while `TEMP`. |

### 2.12 Analytics intake

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/analytics/events` | Public (optional auth) | Batch `[ { type, placeId?, collegeId?, … } ]`; fire-and-forget `202`; validated against a whitelist; throttled; bots ignored. |

### 2.13 Staff / admin

Each domain module owns its admin controller; these are the queues and tools.

| Area | Endpoints | Permission |
|---|---|---|
| Dashboard | `GET /admin/dashboard/queues` (pending counts); `GET /admin/dashboard/stats`, `GET /admin/dashboard/trends?range=` | `dashboard.view` (queues, moderators and up); `analytics.view_platform` (stats and trends, admins and up) |
| Places | `GET /admin/places` (all statuses; `q`, `status`, `categoryId`, `collegeId`, `source`, `verification`); `GET /admin/places/:id`; `POST /admin/places/:id/(suspend, restore, mark-closed, archive, verify, unverify, feature, unfeature, recompute-proximity)` | suspend / restore / mark-closed: `place.moderate` · archive: `place.archive` · verify / unverify: `place.verify` · feature / unfeature: `place.feature` · recompute-proximity: `place.update` |
| Submissions | `GET /admin/submissions`; `GET /admin/submissions/:id` (side-by-side with duplicate candidates); `POST …/(approve, reject, request-changes, merge)` | `submission.review` |
| Contributions | `GET /admin/contributions`; `POST …/:id/(approve, reject)` | `contribution.review` |
| Claims | `GET /admin/claims`; `GET /admin/claims/:id` (evidence via signed URLs); `POST …/(approve, reject, request-info)`; `POST /admin/places/:id/unlink-owner` | `claim.review` |
| Reviews | `GET /admin/reviews`; `POST …/:id/(hide, restore, remove)` | `review.moderate` |
| Businesses | `GET /admin/businesses`; `POST …/:id/(verify, reject, suspend)` | `business.verify` / `business.manage` |
| Users | `GET /admin/users`; `GET /admin/users/:id`; `POST …/:id/(suspend, reactivate)` | `user.view` / `user.suspend` |
| Staff & roles | `GET/POST /admin/staff`; `PUT /admin/users/:id/roles` | `staff.manage` (SUPER_ADMIN) |
| Imports | `POST /admin/imports/(colleges, places)?dryRun=true`; `POST /admin/imports/:id/commit`; `GET /admin/imports/:id` | `import.run` |
| Settings | `GET/PUT /admin/settings/:key` | `settings.manage` (SUPER_ADMIN) |
| Audit | `GET /admin/audit-logs` (`actor`, `action`, `entityType`, `entityId`, `from`, `to`); `GET /admin/audit-logs/export` | `audit.read` / `audit.export` |

Every state-changing admin call writes an `audit_logs` row (actor, roles, action, entity, before/after, reason, request id).

### 2.14 Meta and health

| Method | Path | Access |
|---|---|---|
| GET | `/meta/client-config` | Public |
| GET | `/health` | Public. Liveness: `{ success, data: { status: "ok" }, message: "API is running" }`. Never touches the database, never throttled. |
| GET | `/health/database` | Public. Readiness: runs `SELECT 1`; `503 DATABASE_UNAVAILABLE` when MySQL is unreachable. |

### 2.15 Phase 2 / 3 (reserved, not built now)

`/marketplace/listings`, `/marketplace/listings/:id`, `…/(sold, renew)`, `/admin/marketplace/*` and `/groups`, `/posts`, `/events`. They reuse `/reports`, `/uploads`, `/search`, `/categories?scope=MARKETPLACE`, notifications and moderation unchanged.

## 3. Cross-cutting API behaviours

- **Serialisation:** responses are built from explicit `select`s and response schemas; internal fields (`password_hash`, moderation notes, evidence URLs) cannot leak.
- **Validation:** strict zod schemas (unknown keys rejected); text trimmed, control characters removed, HTML stripped; lengths capped.
- **Consistency:** the same `PlaceCard` and `PlaceDetail` are used by list, search, home rails, saved places and admin previews.
- **Authorisation failures** on private resources return `404` rather than `403` where revealing existence would leak information.
- **Audit:** implemented once as a decorator + service so no controller writes audit rows by hand.
