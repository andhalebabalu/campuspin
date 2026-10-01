# 12. Business capabilities, orders, payments and invoices

One business dashboard for every kind of business. What a business sees and can call depends on
its **capabilities**, never on code that checks its type.

```
business type ─► type's default capabilities ─► ± per-business overrides ─► effective capabilities
                 (table business_type_capabilities)  (business_capability_overrides)
                                                                              │
                     sidebar, overview cards, quick actions  ◄────────────────┤ (web: modules.ts)
                     API routes and service checks           ◄────────────────┘ (api: @RequiresCapability)
```

## Business type

Taken from, in order: the business's own type (set by staff), its category's type
(`categories.businessType`), else `OTHER`. Seeded category types: restaurants and cafes →
HOTEL_RESTAURANT, mess and tiffin → MESS, pg and hostels → PG, rooms → ROOM_RENTAL, libraries and
reading rooms → LIBRARY, xerox and printing → PRINTING_XEROX, laundry → SERVICE.

## Default capabilities

| Type | Capabilities |
|---|---|
| Hotel / restaurant | Orders, table ordering, invoices, payments, revenue analytics |
| Mess | Orders, invoices, payments, revenue analytics |
| Printing / xerox | Orders, invoices, payments |
| PG / hostel | Enquiries, bookings, service requests, payments |
| Room rental | Enquiries, bookings, payments |
| Library | Enquiries, bookings, membership, payments |
| Salon | Appointments, orders, invoices, payments |
| Service | Service requests, bookings, invoices, payments |
| Other | Enquiries |

Super admins change a type's defaults at `/admin/business-types`; staff with `businesses.manage`
set one business's type or turn single capabilities on/off on its admin page. Turning a capability
off switches off the business's place services that need it, so students stop seeing them.
The upgrade migration kept every feature a business already used as an override.

Common to every business: overview, profile, public page, photos, hours, location, listings,
reviews, offers, QR codes, analytics, share, subscription, settings, help.

## What each capability unlocks

| Capability | Dashboard | API |
|---|---|---|
| ORDER_MANAGEMENT | Orders, food/daily menu | `/business/orders*`, menus, food and print services; students can order |
| TABLE_ORDER | Tables, table requests | `/business/places/:id/tables`, table QR codes, `/business/tables/live`, table requests |
| INVOICE | Invoices | `/business/invoices*`; invoices issued on completion |
| PAYMENT (with orders) | Payments | `POST /business/orders/:id/payment` |
| BOOKING / APPOINTMENT | Bookings | `/business/bookings`, schedules, booking services |
| ENQUIRY | Enquiries | `/business/enquiries`; students can send enquiries |
| SERVICE_REQUEST | Requests (jobs) | `/business/requests` (general kind), request services |
| REVENUE_ANALYTICS | Revenue cards | revenue in `/business/summary` |
| MEMBERSHIP | — (reserved, no module yet) | — |

A missing capability answers `403 CAPABILITY_REQUIRED`.

## Orders, payment and invoice

Order status (`PENDING` placed → `ACCEPTED` → `PREPARING` → `READY` → (`SERVED`) → `COMPLETED`, or
`CANCELLED`/`REJECTED`) and payment status (`UNPAID`/`PAID`/`REFUNDED`) are separate: completed
does not mean paid. The business records payment (cash, UPI, card); `ONLINE` is reserved for a
gateway such as Razorpay later.

When a business with INVOICE completes an order, the same transaction issues its invoice:
one per order (unique), numbered per business (`AFR-2026-0001`), with the business and customer
details copied. It is `ISSUED`, or `PAID` once the order is paid. No tax is configured, so tax is
0 and not shown. Business and the student who ordered can view it, print it and download a PDF
(built without a library; Latin-1 text only, so ₹ prints as "Rs." and non-Latin names as "?").

## Upgrading

```
npm run db:migrate:deploy     # 20260930120000_business_capabilities_and_invoices
npm run db:seed:reference     # type defaults and category types on a fresh database
```
