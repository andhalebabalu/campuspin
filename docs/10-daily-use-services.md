# 10 · Daily-use services

CampusPin moves from "find a place" to "use a place": **discover → scan → use → order/request/book → track → review**. This document describes the model, the API and the rules behind it. Built in five phases (September 2026).

## 1. The service model

| Concept | Table | Notes |
|---|---|---|
| Service type | `service_types` | Admin-managed data: `ORDER_FOOD`, `PRINT`, `LAUNDRY`, `APPOINTMENT`, `ROOM`, `STUDY_SPACE`, `REPAIR`, `OFFERS`, `DAILY_MENU`, `TABLE_SERVICE`. `kind` decides the behaviour (`FOOD_ORDER`, `DAILY_MENU`, `TABLE_SERVICE`, `PRINT_ORDER`, `SERVICE_REQUEST`, `BOOKING`, `OFFERS`, `LISTING`). `showOnHome` makes it a quick action. New types of an existing kind need no code (e.g. "Tailoring" as `SERVICE_REQUEST`). |
| Place service | `place_services` | One row per place and type: `enabled` (owner), `disabledByAdmin` (staff, wins), `config` JSON validated per kind (`serviceConfigSchemas` in contracts). |
| Catalogue | `service_items` | One reusable price list: dishes (sections, veg, paid add-ons), repair types, haircuts, study seats (`durationMinutes`, `capacity`). |
| Daily menu | `daily_menus`, `daily_menu_items` | One per place per India date; `DRAFT` / `PUBLISHED` / `REMOVED` (staff). |
| Tables and QR | `place_tables`, `place_qr_codes` | QR carries only a random 128-bit token (`/q/<token>`); `activeKey` keeps one live code per target; regenerate retires the old print. |
| Orders | `service_orders`, `service_order_items` | Food and print. Totals always computed by the server; names/prices copied into lines. |
| Requests | `service_requests`, `table_request_types` | Table requests (de-duplicated while open) and jobs with estimates. |
| Offers | `student_offers`, `offer_redemptions` | Uses unique per (offer, student, period, slot); total limit checked and counted in one SQL statement. |
| Bookings | `booking_schedules`, `bookings` | Weekly windows; `slotKey` (item, start, seat) unique while live, `studentKey` stops one student booking a slot twice. |
| Private files | `private_documents` | Print PDFs and request photos in `PRIVATE_UPLOAD_DIR`; attached once, deleted when the job ends. |
| Analytics | `place_daily_stats` | Views and QR scans per place per India day, counted from now (no back-fill). |

Status history is the audit log (`ORDER_*`, `SERVICE_REQUEST_*`, `BOOKING_*` actions carry `{ from, to }`).

## 2. Lifecycles

- **Food order:** `PENDING → ACCEPTED | REJECTED | CANCELLED`, `ACCEPTED → PREPARING | READY | CANCELLED`, `PREPARING → READY | CANCELLED`, `READY → SERVED | COMPLETED`, `SERVED → COMPLETED`. Student may cancel only while `PENDING`.
- **Print order:** same states, labelled Submitted / Printing / Ready for pickup; no `SERVED`. The PDF is deleted on a final status.
- **Table request:** `NEW → ACKNOWLEDGED | COMPLETED | CANCELLED`.
- **Job (repair, laundry):** `NEW → ACCEPTED | REJECTED`, `ACCEPTED → DIAGNOSING | ESTIMATE_AVAILABLE | IN_PROGRESS`, `ESTIMATE_AVAILABLE → APPROVED` (student only), `APPROVED → IN_PROGRESS → READY → COMPLETED`.
- **Booking:** `PENDING → CONFIRMED | CANCELLED`, `CONFIRMED → COMPLETED | NO_SHOW | CANCELLED`; auto-confirm is a per-service setting.

Every move is a compare-and-set on the old status (409 `STATUS_CHANGED` if someone moved it first).

## 3. API

Student / public:
`GET /service-types`, `GET /service-types/:key/places`, `GET /me/home`, `GET /places/:idOrSlug/services`, `GET /places/:idOrSlug/menus`, `GET /menus/today`, `GET /qr/:token`, `POST /places/:idOrSlug/view`, `POST /orders`, `POST /orders/print`, `GET /me/orders[/:id]`, `POST /me/orders/:id/cancel`, `GET /me/orders/:id/document`, `POST /uploads/documents`, `POST /service-requests`, `GET /me/service-requests[/:id]`, `POST /me/service-requests/:id/{cancel,approve}`, `GET /me/service-requests/:id/photo`, `GET /offers/nearby`, `POST /offers/:id/redeem`, `GET /me/redemptions`, `GET /places/:idOrSlug/availability`, `POST /bookings`, `GET /me/bookings`, `POST /me/bookings/:id/cancel`.

Business (own places only; anything else is 404):
`/business/places/:placeId/{services[/:key], menus[/:date[/publish|/unpublish|/copy]], items[/:itemId], tables[/:tableId], qr, request-types[/:typeId], schedules/:key}`, `/business/qr/:id/{regenerate,disable,enable}`, `/business/orders[/:id[/status|/document]]`, `/business/requests[/:id/status|/photo]`, `/business/offers[/:id]`, `/business/redemptions[/verify]`, `/business/bookings[/:id/status]`, `/business/insights?range=today|7d|30d`.

Staff: `/admin/service-types`, `/admin/place-services`, `/admin/menus`, `/admin/offers`, `/admin/qr-codes` (`services.moderate`); `/admin/orders`, `/admin/service-requests`, `/admin/bookings` (`services.manage`).

## 4. Security rules

- Prices, discounts, print totals and page counts are computed on the server; clients send ids and choices only (strict schemas reject extra fields such as `price`).
- Idempotency keys on orders, requests and bookings: a retried tap returns the first result.
- Ownership through `BusinessAccessService`; a suspended business manages and offers nothing.
- Uploads: type from the bytes (PDF header + `%%EOF`, image magic numbers), size limits, no encrypted PDFs, page cap, inflate budget; private files are served with `no-store`, only to their owner and the business they were sent to, and every opening is audited.
- Rate limits on ordering, requests, uploads, offer codes, code verification, bookings and QR lookups.
- Notifications: `ORDERS` category always sends; `PLACE_UPDATES` (new menus and offers of saved places) follows the member's switch.

## 5. Real time

No WebSockets: the business boards poll every 5 s (orders, requests) or 15 s (bookings); student tracking every 10 s until final. The services return the whole updated object, so a push channel can be added later without changing them.

## 6. Not done yet

Online payment (all pay-at-counter / pay-at-pickup), booking reminders (no scheduler), push notifications, per-service operating hours for food ordering (the owner pauses orders instead), PDF download on the business mobile app (use the web dashboard), demo seed data for the new tables.
