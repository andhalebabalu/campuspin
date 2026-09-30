# 11. Business accounts, public business pages and the admin CRM

How businesses get onto CampusPin, what students see, and how staff manage them. Built in five
phases (commits `52ad362`, `0444457`, `71b3273`, `3556bf6` and the phase 5 commit).

## Accounts

- **Student and business accounts are separate.** Sign-up asks once ("Continue as" at
  `/register` and `/login`): `/student/register`, `/business/register`, `/student/login`,
  `/business/login`. A business sign-up gets the `BUSINESS_OWNER` role and a business profile
  (name, category, phone, city, optional description) in one write; a student gets `STUDENT`.
  Staff roles are never self-service. Staff sign in on `/admin` itself.
- One account is never both. The server enforces it: every `/business/*` route needs
  `BUSINESS_OWNER`; owners reach only their own business (another business's ids answer 404);
  a suspended business can read its dashboard but change nothing.
- After sign-in everyone lands on their own home: students `/home`, businesses
  `/business/dashboard`, staff `/admin`. Old addresses redirect (`/dashboard`,
  `/register?type=business`, `/student/dashboard`, `/admin/dashboard`, `/business/profile`,
  `/business/preview`).
- The sign-in email is private. Sign-up no longer copies it into the public business email
  (migration `20260929171000` cleared the copies made before).

## The public business page: `/business/<slug>`

- Built from the **business profile** (name, logo, cover, description, WhatsApp, socials,
  public email) and its **places** (location, hours, photos, reviews, services, prices). Nothing
  is stored twice. The most reviewed live place is the main one; others show as branch cards.
- **Visible only when** the business is active, not rejected, and at least one of its listings
  passed staff review. Anything else is a 404. The "Verified" badge is separate: staff add it.
- A one-branch business's `/places/<slug>` redirects to its business page; directory places use
  the same page design.
- Slugs never change (a rename keeps the link) and can never be an app word (`dashboard`,
  `login`, `register`, `profile`, `preview`...).
- SEO: title, description, canonical URL, Open Graph and Twitter tags, a generated preview card
  (`/business/<slug>/opengraph-image`: name, category, rating, cover photo) and schema.org
  `LocalBusiness` data. No owner information is ever in the page or its metadata.
- Share: the phone's share sheet where available, otherwise copy link, WhatsApp, Facebook,
  Telegram (Instagram: copy the link).

## Page analytics

`POST /businesses/:slug/events` counts `PAGE_VIEW`, `PHONE_CLICK`, `WHATSAPP_CLICK`,
`DIRECTION_CLICK`, `SHARE_CLICK` in `business_events` with only the business, the place and the
time: no user, IP or device. Views count once per browser tab session; the route is rate-limited.
The owner's dashboard and the admin's business analytics read these rows; nothing is estimated.

## Business dashboard: `/business/dashboard`

Sidebar sections: Dashboard, Business profile, Public page, Services & menu, Photos, Opening
hours, Location, Listings, Reviews, Enquiries, Offers, Orders & bookings, QR codes, Analytics,
Share page, Subscription, Settings, Help & support, plus Preview. Owner edits to their places
(details, hours, prices, photos, location) go live at once through the same validated, audited
code staff use. New listings still go through staff review.

## Plans

`business_plans` (seeded: FREE available and default; Business Pro and Business Premium prepared,
not on sale, no price) and `business_subscriptions` (at most one active per business). A business
with no active subscription is on FREE. Staff can assign a plan by hand; there is no payment
gateway, and no feature is gated by plan yet.

## Admin CRM: `/admin`

Grouped sidebar (Main, Management, Community, Business, Analytics, System), each entry shown only
with the permission its API needs. Businesses: search, filters (category, city, status,
verification, dates), sort, pagination, bulk verify/suspend/reinstate, and a detail page
(profile, owner, listings, live page preview, history, plan, edit, transfer).

| Decision | Effect |
|---|---|
| Verify / unverify | The Verified badge; nothing else changes |
| Reject (reason required) | Page and listings hidden; owner notified with the reason |
| Suspend (reason required) | Page and listings hidden, dashboard read-only; owner notified |
| Reinstate | Suspended → active, rejected → pending; exactly the listings that decision hid come back (`hiddenPlaceIds`) |
| Delete | Only while nothing depends on the business; otherwise suspend |

The audit log (`/admin/audit-logs`, permission `audit.read`) shows every staff and owner action.

## Moving businesses off student accounts

The code never let a student own a business, but data from elsewhere could. To check:

```
cd apps/api && npx tsx scripts/check-business-ownership.ts
```

It is read-only and exits 1 while anything is listed. The same list is in the admin panel
(Businesses → Ownership check). To fix one: the owner signs up as a business (with another
email), staff delete the empty business that sign-up created, then open the old business and use
**Transfer ownership**. Listings, reviews and history stay with the business. Nothing is moved
automatically.

## Upgrading an existing installation

```
npm run db:migrate:deploy     # business_profile_details, business_events, clear_copied_signup_emails,
                              # business_plans, business_hidden_places
npm run db:seed:reference     # the plans and the audit.read permission
```

Optional web setting: `NEXT_PUBLIC_SUPPORT_EMAIL` shows a contact address in the business
dashboard's Help page (hidden when empty).
