# 07 · Roles and permission matrix

Answers spec §62 item **9**. Authorisation is two-layered ([02 §5.2](02-architecture.md#52-rbac-and-policy-two-layers)): **coarse** role→permission from the database, then a **fine** resource policy in the service. Both are always verified server-side; the client only hides controls for UX.

> **Phase 2 status:** the database seed creates the 5 roles and **17 permission keys** defined in `packages/contracts/src/rbac.ts` (`users.read`, `users.manage`, `colleges.read`, `colleges.manage`, `categories.read`, `categories.manage`, `places.read`, `places.create`, `places.update`, `places.manage`, `submissions.review`, `claims.review`, `reviews.moderate`, `reports.manage`, `businesses.manage`, `analytics.view`, `settings.manage`) and their role grants. That set is authoritative until the finer-grained catalogue below is reconciled with it.

> **Phase 3 status:** the coarse layer is implemented and uses exactly those 17 keys and the existing `roles`, `permissions`, `role_permissions` and `user_roles` tables (no second scheme). Global guards run **rate limit -> `JwtAuthGuard` -> `RolesGuard` -> `PermissionsGuard`**, so the API is **secure by default**: a route is protected unless it says `@Public()`. Decorators: `@Public()`, `@Roles(...)` (at least one), `@Permissions(...)` (all of them, granted by the union of the caller's roles) and `@CurrentUser()`. Roles come from the signed access token (never from anything the client sends); role -> permission grants are read from `role_permissions` and cached in memory for 60 s (`RbacService.invalidate()` clears it). There is deliberately no "SUPER_ADMIN bypass" in code: `SUPER_ADMIN` can do everything only because the seed grants it every permission, and `ADMIN` is not granted `settings.manage`. `e2e-db` tests assert a role x permission matrix over probe routes and sweep every documented route unauthenticated (only an explicit allow-list may answer without a token). The resource-policy layer, the route-map test and the audited admin actions listed below are still to come with the phases that add those resources.

## 1. Roles

| Role | Who | Notes |
|---|---|---|
| `STUDENT` | students (and anyone browsing signed in) | Additive with other roles. |
| `BUSINESS_OWNER` | people who list/claim businesses | Additive; a student can also be an owner. |
| `MODERATOR` | trusted reviewers | Handles content queues; cannot change catalogue, ownership or users. |
| `ADMIN` | operations | Everything content-related, verification, claims, users. |
| `SUPER_ADMIN` | founders | Everything, plus staff/roles, settings, audit export, erasure. |

Anonymous visitors can browse and search only. New roles can be added as rows, with no auth redesign.

## 2. Permission catalogue (staff / global)

`college.manage` · `category.manage` · `place.create` · `place.update` · `place.moderate` (suspend, restore, mark closed) · `place.verify` (verified badge) · `place.feature` · `place.archive` · `submission.review` · `contribution.review` · `claim.review` · `review.moderate` · `report.review` · `business.verify` · `business.manage` · `offer.moderate` · `user.view` · `user.suspend` · `user.anonymize` · `import.run` · `dashboard.view` (queue counts) · `analytics.view_platform` · `audit.read` · `audit.export` · `settings.manage` · `staff.manage`. Later phases add `marketplace.moderate`, `community.moderate`, `ads.manage`.

Non-staff capabilities are role-based **plus an ownership policy**: `place.suggest`, `contribution.create`, `review.create`, `lead.create`, `business.create`, `listing.manage_own`, `claim.create`, `review.reply_own`, `lead.read_own`, `analytics.view_own`. Any signed-in user may `save.manage` and `report.create`.

### Default role bindings

| Role | Permissions |
|---|---|
| MODERATOR | `submission.review`, `contribution.review`, `review.moderate`, `report.review`, `place.moderate`, `offer.moderate`, `user.view` (limited fields), `dashboard.view` |
| ADMIN | all MODERATOR + `college.manage`, `category.manage`, `place.create`, `place.update`, `place.verify`, `place.feature`, `place.archive`, `claim.review`, `business.verify`, `business.manage`, `user.suspend`, `import.run`, `analytics.view_platform`, `audit.read`; full-field `user.view` |
| SUPER_ADMIN | all ADMIN + `staff.manage`, `settings.manage`, `audit.export`, `user.anonymize` (+ future `ads.manage`) |

## 3. Matrix

✔ allowed · — not allowed · **own** limited to resources the user owns / belongs to · **ltd** limited fields.

| Capability | Anon | Student | Owner | Mod | Admin | Super |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **Browse** | | | | | | |
| Browse colleges, categories, places; search | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| See phone / WhatsApp on a place | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| Save / unsave a place | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Contribute** | | | | | | |
| Suggest a place | — | ✔ | ✔ (via listing flow) | — | — | — |
| Suggest an edit / photo / confirm | — | ✔ | ✔ | — | — | — |
| Write a review (not on own business) | — | ✔ | — | — | — | — |
| Edit / withdraw own review | — | **own** | **own** | — | — | — |
| Send enquiry (lead) | — | ✔ | — | — | — | — |
| Report content | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Business** | | | | | | |
| Create business profile | — | — | ✔ | — | ✔ | ✔ |
| Create / edit draft listing, submit | — | — | **own** | — | ✔ | ✔ |
| Edit a live listing (tiered, D2) | — | — | **own** | — | ✔ | ✔ |
| Claim an unclaimed place | — | — | ✔ | — | — | — |
| Reply to a review on own place (once) | — | — | **own** | — | — | — |
| Hide / delete a review | — | — | **never** | ✔ | ✔ | ✔ |
| View own leads, reviews, analytics | — | — | **own** | — | — | — |
| **Moderation** | | | | | | |
| Review submissions and contributions | — | — | — | ✔ | ✔ | ✔ |
| Approve / reject claims; unlink owner | — | — | — | — | ✔ | ✔ |
| Moderate reviews (hide / restore / remove) | — | — | — | ✔ | ✔ | ✔ |
| Triage and resolve reports | — | — | — | ✔ | ✔ | ✔ |
| Suspend / restore a place | — | — | — | ✔ | ✔ | ✔ |
| Archive a place; verified badge; feature | — | — | — | — | ✔ | ✔ |
| Moderate offers | — | — | — | ✔ | ✔ | ✔ |
| **Administration** | | | | | | |
| Create / edit places directly | — | — | — | — | ✔ | ✔ |
| Manage colleges and cities | — | — | — | — | ✔ | ✔ |
| Manage categories, attributes, amenities | — | — | — | — | ✔ | ✔ |
| Verify or suspend a business | — | — | — | — | ✔ | ✔ |
| View users | — | — | — | ltd | ✔ | ✔ |
| Suspend / reactivate a user | — | — | — | — | ✔ | ✔ |
| CSV import | — | — | — | — | ✔ | ✔ |
| Dashboard: queue counts | — | — | — | ✔ | ✔ | ✔ |
| Dashboard: platform analytics | — | — | — | — | ✔ | ✔ |
| Read audit logs | — | — | — | — | ✔ | ✔ |
| Export audit logs | — | — | — | — | — | ✔ |
| Assign roles / create staff | — | — | — | — | — | ✔ |
| Change settings (thresholds, weights, flags) | — | — | — | — | — | ✔ |
| Anonymise / erase a user | — | — | — | — | — | ✔ |

## 4. Resource-level rules (fine layer)

1. **Place edit:** staff with `place.update`, or an `ACTIVE` member with role `OWNER`/`MANAGER` of `places.business_id`. `STAFF` members are read-only.
2. **Owner edits on live places** follow the tier table (D2). Low-risk: hours, phone, price options, amenities, description → applied instantly and flagged for post-review. High-risk: name, category, location, ownership, **photos** → queued.
3. **Reviews:** only the author edits or withdraws. The owner of the reviewed place can reply once and report, never hide or delete. Authors cannot review a place their business owns.
4. **Submissions and contributions:** visible and editable only by the author, and only in `PENDING` / `NEEDS_CHANGES`.
5. **Claims:** visible to the claimant's business members and staff; a place already owned rejects new claims with `PLACE_ALREADY_CLAIMED`.
6. **Leads:** the receiving business's members see them; the student sees their own.
7. **Media:** only the uploader may delete a `TEMP` asset; claim evidence is private and reachable by staff with `claim.review` via short-lived signed URLs.
8. **Conflict of interest:** staff cannot review, approve or moderate items they authored or own.
9. **Self-protection:** nobody can change their own roles; the last `SUPER_ADMIN` cannot be removed or suspended; only `SUPER_ADMIN` can suspend an `ADMIN` or `SUPER_ADMIN`.
10. **Account state:** `PENDING_VERIFICATION` and `SUSPENDED` accounts can browse publicly but cannot perform any write.

## 5. Audited actions (reason required)

Suspend/reactivate user · remove review · suspend/archive place · verify/unverify · approve/reject claim · unlink owner · role change · settings change · merge · bulk import commit · audit export · anonymise user. Each writes an `audit_logs` row (actor, roles, action, entity, before/after, reason, request id, IP for staff).

## 6. How the matrix is enforced and tested

- **Deny by default:** a global guard rejects any route that has neither `@Public()` nor an access declaration (`@RequirePermissions`, `@Roles`, or `@Policy`).
- **Route-map test:** a test walks the Nest route table and **fails the build** if any route lacks an access declaration.
- **Table-driven permission tests:** the matrix above is encoded as data (`rbac.matrix.ts`). For each endpoint it asserts `401` (anonymous), `403` (disallowed role), success (allowed role) and `403/404` (allowed role, wrong owner).
- **Regression tests** for rules 5, 8 and 9 specifically (the ones people forget).
