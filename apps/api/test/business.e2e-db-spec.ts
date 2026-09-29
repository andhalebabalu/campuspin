import { randomUUID } from 'node:crypto';
import {
  UPLOAD_IMAGE_MAX_BYTES,
  adminPlaceSchema,
  businessDashboardSchema,
  businessLeadSchema,
  businessListingSchema,
  businessProfileSchema,
  businessReviewSchema,
  leadReceiptSchema,
  placeDetailSchema,
  placeSubmissionSchema,
  registerResponseSchema,
  uploadedImageSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  STRONG_PASSWORD,
  TEST_CATEGORY_SLUG_PREFIX,
  bearer,
  businessSignupFields,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
  testEmail,
} from './support/auth-e2e.js';
import { destination } from './support/geo.js';

const API = '/api/v1';
// Far from every other e2e suite's test area, so duplicate detection never sees their places.
const BASE = { latitude: 25.3, longitude: 82.4 };
const run = randomUUID().slice(0, 6);
let sequence = 0;
// Starts with "E2E Place", so the slug starts with `TEST_PLACE_SLUG_PREFIX` and cleanup removes it.
const uniqueName = (label: string) => `E2E Place Business ${run} ${label} ${(sequence += 1)}`;
let spotCount = 0;
const freshSpot = () => destination(BASE, 90, 3000 * (spotCount += 1));

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

type Req = { set: (name: string, value: string) => Req };

describe('Business owners, enquiries and uploads (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let owner: { userId: string; token: string };
  let otherOwner: { token: string };
  let student: { userId: string; token: string; email: string };
  let moderator: { token: string };
  let admin: { token: string };
  let categoryId: string;
  /** The owner's listing, approved in `beforeAll`: live and linked to the owner's business. */
  let livePlace: { id: string; slug: string };

  const as = <T extends Req>(who: { token: string }, req: T): T =>
    req.set('Authorization', bearer(who.token)) as T;

  async function persona(label: string, options: { role?: string; businessName?: string } = {}) {
    const account = await registerAndVerify(ctx, {
      label,
      ...(options.businessName ? { businessName: options.businessName } : {}),
    });
    if (options.role) await grantRole(ctx.db, account.userId, options.role);
    const { accessToken } = await login(ctx, account);
    return { userId: account.userId, email: account.email, token: accessToken };
  }

  function listingBody(label: string) {
    return {
      name: uniqueName(label),
      categoryId,
      address: 'Lanka Road, Testville',
      city: 'Testville',
      ...freshSpot(),
      phone: '+91 98765 43210',
      priceAmount: 3200,
      priceUnit: 'MONTH',
    };
  }

  async function createListing(who: { token: string }, label: string) {
    const response = await as(who, ctx.post(`${API}/business/listings`))
      .send(listingBody(label))
      .expect(201);
    return successOf(placeSubmissionSchema, response).data;
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    owner = await persona('biz-owner', { businessName: `E2E Sai Krupa Mess ${run}` });
    otherOwner = await persona('biz-other', { businessName: `E2E Other Mess ${run}` });
    student = await persona('biz-student');
    moderator = await persona('biz-moderator', { role: 'MODERATOR' });
    admin = await persona('biz-admin', { role: 'ADMIN' });

    const group = await as(admin, ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Biz Group ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}biz-group-${run}`,
      })
      .expect(201);
    const leaf = await as(admin, ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Biz Mess ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}biz-mess-${run}`,
        parentId: (group.body as { data: { id: string } }).data.id,
        defaultPriceUnit: 'MONTH',
      })
      .expect(201);
    categoryId = (leaf.body as { data: { id: string } }).data.id;

    const submission = await createListing(owner, 'Live');
    await as(moderator, ctx.post(`${API}/admin/submissions/${submission.id}/approve`))
      .send({})
      .expect(200);
    const place = await ctx.db.place.findUniqueOrThrow({
      where: { id: submission.resultingPlaceId ?? '' },
      select: { id: true, slug: true },
    });
    livePlace = place;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // ── Registration ───────────────────────────────────────────────────────────────────────────────

  describe('registering as a business', () => {
    it('creates a BUSINESS_OWNER with a business profile, never a student', async () => {
      const email = testEmail('biz-register');
      const response = await ctx
        .post(`${API}/auth/register`)
        .send({
          name: 'Ravi Kulkarni',
          email,
          password: STRONG_PASSWORD,
          accountType: 'BUSINESS',
          businessName: '  Ravi   Tiffin Services ',
          ...(await businessSignupFields(ctx.db)),
        })
        .expect(201);

      expect(successOf(registerResponseSchema, response).data.user.roles).toEqual([
        'BUSINESS_OWNER',
      ]);
      const stored = await ctx.db.user.findUniqueOrThrow({
        where: { email },
        select: { ownedBusinesses: { select: { businessName: true, slug: true, email: true } } },
      });
      expect(stored.ownedBusinesses).toHaveLength(1);
      // The sign-in email is never copied to the (public) business email.
      expect(stored.ownedBusinesses[0]).toMatchObject({
        businessName: 'Ravi Tiffin Services',
        email: null,
      });
      expect(stored.ownedBusinesses[0]?.slug).toMatch(/^ravi-tiffin-services/);
    });

    it('gives two businesses with the same name distinct slugs', async () => {
      const name = `E2E Same Name ${run}`;
      for (const label of ['same-a', 'same-b']) {
        await ctx
          .post(`${API}/auth/register`)
          .send({
            name: 'Owner',
            email: testEmail(label),
            password: STRONG_PASSWORD,
            accountType: 'BUSINESS',
            businessName: name,
            ...(await businessSignupFields(ctx.db)),
          })
          .expect(201);
      }
      const slugs = await ctx.db.businessProfile.findMany({
        where: { businessName: name },
        select: { slug: true },
      });
      expect(new Set(slugs.map((row) => row.slug)).size).toBe(2);
    });

    it('requires a business name, and refuses any other account type', async () => {
      const base = { name: 'Owner', password: STRONG_PASSWORD };
      const noName = await ctx
        .post(`${API}/auth/register`)
        .send({ ...base, email: testEmail('biz-noname'), accountType: 'BUSINESS' })
        .expect(400);
      expect(Object.keys((errorOf(noName).error.details as { fields: object }).fields)).toContain(
        'businessName',
      );
      await ctx
        .post(`${API}/auth/register`)
        .send({ ...base, email: testEmail('biz-admin-type'), accountType: 'ADMIN' })
        .expect(400);
    });

    it('stores the sign-up details on the business, which starts pending and not public', async () => {
      const email = testEmail('biz-details');
      const fields = await businessSignupFields(ctx.db);
      await ctx
        .post(`${API}/auth/register`)
        .send({
          name: 'Meera Joshi',
          email,
          password: STRONG_PASSWORD,
          accountType: 'BUSINESS',
          businessName: `E2E Details Mess ${run}`,
          ...fields,
          description: 'Home-style veg thali near the college gate.',
        })
        .expect(201);
      const stored = await ctx.db.businessProfile.findFirstOrThrow({
        where: { owner: { email } },
        select: {
          categoryId: true,
          phone: true,
          whatsapp: true,
          city: true,
          description: true,
          status: true,
          verificationStatus: true,
          owner: { select: { collegeId: true } },
        },
      });
      expect(stored).toEqual({
        categoryId: fields.categoryId,
        phone: fields.phone,
        whatsapp: fields.phone,
        city: 'Ahilyanagar',
        description: 'Home-style veg thali near the college gate.',
        status: 'ACTIVE',
        verificationStatus: 'PENDING',
        owner: { collegeId: null },
      });
    });

    it('refuses an unknown category and never uses an app page as the slug', async () => {
      const fields = await businessSignupFields(ctx.db);
      const base = { name: 'Owner', password: STRONG_PASSWORD, accountType: 'BUSINESS', ...fields };
      const unknown = await ctx
        .post(`${API}/auth/register`)
        .send({
          ...base,
          email: testEmail('biz-badcat'),
          businessName: 'Anything',
          categoryId: '0199c3b2-7d41-7000-8000-00000000abcd',
        })
        .expect(400);
      expect(Object.keys((errorOf(unknown).error.details as { fields: object }).fields)).toEqual([
        'categoryId',
      ]);

      const email = testEmail('biz-reserved');
      await ctx
        .post(`${API}/auth/register`)
        .send({ ...base, email, businessName: 'Dashboard' })
        .expect(201);
      const { slug } = await ctx.db.businessProfile.findFirstOrThrow({
        where: { owner: { email } },
        select: { slug: true },
      });
      expect(slug).not.toBe('dashboard');
      expect(slug).toMatch(/^dashboard-business/);
    });
  });

  // ── Uploads ────────────────────────────────────────────────────────────────────────────────────

  describe('image uploads', () => {
    it('stores a real image under a random name and serves it back', async () => {
      const response = await as(student, ctx.post(`${API}/uploads/images`))
        .attach('file', PNG, { filename: '../../evil.php', contentType: 'text/x-php' })
        .expect(201);
      const uploaded = successOf(uploadedImageSchema, response).data;
      expect(uploaded).toMatchObject({ contentType: 'image/png', sizeBytes: PNG.length });
      // The name comes from the bytes' real type, never from what the client sent.
      expect(uploaded.url).toMatch(/\/uploads\/[0-9a-f-]{36}\.png$/);

      const served = await ctx.get(new URL(uploaded.url).pathname).expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);
    });

    it('refuses a non-image with 415, whatever it is named', async () => {
      const response = await as(student, ctx.post(`${API}/uploads/images`))
        .attach('file', Buffer.from('<svg onload="alert(1)"/>'), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(415);
      expect(errorOf(response).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('refuses a missing file (400) and a file over the size limit (413)', async () => {
      const missing = await as(student, ctx.post(`${API}/uploads/images`)).expect(400);
      expect(errorOf(missing).error.code).toBe('VALIDATION_ERROR');

      const huge = Buffer.alloc(UPLOAD_IMAGE_MAX_BYTES + 1);
      huge.set([0xff, 0xd8, 0xff]);
      const tooBig = await as(student, ctx.post(`${API}/uploads/images`))
        .attach('file', huge, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(413);
      expect(errorOf(tooBig).error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────────────────────────

  describe('the business dashboard', () => {
    it('is for business owners only', async () => {
      expect((await as(student, ctx.get(`${API}/business/dashboard`))).status).toBe(403);
      expect((await as(moderator, ctx.get(`${API}/business/listings`))).status).toBe(403);
    });

    it('answers 404 to a business owner without a business profile', async () => {
      const bare = await persona('biz-bare');
      await grantRole(ctx.db, bare.userId, 'BUSINESS_OWNER');
      const { accessToken } = await login(ctx, { email: bare.email, password: STRONG_PASSWORD });
      expect((await as({ token: accessToken }, ctx.get(`${API}/business/dashboard`))).status).toBe(
        404,
      );
    });

    it('a new listing waits for staff review and is invisible to the public until approved', async () => {
      const submission = await createListing(owner, 'Pending');
      expect(submission.status).toBe('PENDING');
      const placeId = submission.resultingPlaceId ?? '';

      const place = await ctx.db.place.findUniqueOrThrow({
        where: { id: placeId },
        select: { status: true, slug: true, businessProfile: { select: { ownerId: true } } },
      });
      expect(place.status).toBe('PENDING');
      expect(place.businessProfile?.ownerId).toBe(owner.userId);
      expect((await ctx.get(`${API}/places/${place.slug}`)).status).toBe(404);

      const listings = successOf(
        z.array(businessListingSchema),
        await as(owner, ctx.get(`${API}/business/listings`)).expect(200),
      ).data;
      expect(listings.find((listing) => listing.id === placeId)).toMatchObject({
        status: 'PENDING',
        review: { status: 'PENDING', note: null },
        primaryCategory: { id: categoryId },
      });
      expect(listings.find((listing) => listing.id === livePlace.id)?.status).toBe('ACTIVE');
    });

    it("never shows one business another's listings", async () => {
      const listings = successOf(
        z.array(businessListingSchema),
        await as(otherOwner, ctx.get(`${API}/business/listings`)).expect(200),
      ).data;
      expect(listings).toEqual([]);
    });

    it('edits the profile, and a logo must be an http(s) URL', async () => {
      const response = await as(owner, ctx.patch(`${API}/business/profile`))
        .send({ description: 'Home-style veg thali.', phone: '+91 90000 00000' })
        .expect(200);
      expect(successOf(businessProfileSchema, response).data).toMatchObject({
        description: 'Home-style veg thali.',
        phone: '+91 90000 00000',
      });
      await as(owner, ctx.patch(`${API}/business/profile`))
        .send({ logoUrl: 'javascript:alert(1)' })
        .expect(400);
    });
  });

  // ── Enquiries ──────────────────────────────────────────────────────────────────────────────────

  describe('enquiries', () => {
    const enquiry = {
      message: 'Is a double-sharing room free from July?',
      contactPhone: '+91 91234 56789',
      consent: true,
    };

    it('a live business place says it accepts enquiries; a place without a business does not', async () => {
      const detail = successOf(
        placeDetailSchema,
        await ctx.get(`${API}/places/${livePlace.slug}`).expect(200),
      ).data;
      expect(detail.acceptsEnquiries).toBe(true);

      const orphan = successOf(
        adminPlaceSchema,
        await as(admin, ctx.post(`${API}/admin/places`))
          .send({
            name: uniqueName('No Business'),
            address: 'Campus Road',
            city: 'Testville',
            state: 'Uttar Pradesh',
            ...freshSpot(),
            categoryIds: [categoryId],
            status: 'ACTIVE',
          })
          .expect(201),
      ).data;
      expect(orphan.acceptsEnquiries).toBe(false);
      const refused = await as(student, ctx.post(`${API}/places/${orphan.slug}/enquiries`))
        .send(enquiry)
        .expect(409);
      expect(errorOf(refused).error.code).toBe('CONFLICT');
    });

    it('requires consent and a student account', async () => {
      await as(student, ctx.post(`${API}/places/${livePlace.slug}/enquiries`))
        .send({ ...enquiry, consent: false })
        .expect(400);
      // Business owners are not students (and could not enquire with their own business anyway).
      await as(owner, ctx.post(`${API}/places/${livePlace.slug}/enquiries`))
        .send(enquiry)
        .expect(403);
    });

    it('reaches the business inbox with the student’s contact details; one open enquiry at a time', async () => {
      const sent = await as(student, ctx.post(`${API}/places/${livePlace.slug}/enquiries`))
        .send(enquiry)
        .expect(201);
      const receipt = successOf(leadReceiptSchema, sent).data;
      expect(receipt).toMatchObject({ status: 'NEW', place: { id: livePlace.id } });

      const again = await as(student, ctx.post(`${API}/places/${livePlace.id}/enquiries`))
        .send(enquiry)
        .expect(409);
      expect(errorOf(again).message).toMatch(/already have an open enquiry/);

      const inbox = await as(owner, ctx.get(`${API}/business/enquiries?status=NEW`)).expect(200);
      const leads = successOf(z.array(businessLeadSchema), inbox).data;
      expect(leads).toHaveLength(1);
      expect(leads[0]).toMatchObject({
        id: receipt.id,
        message: enquiry.message,
        contactPhone: enquiry.contactPhone,
        student: { name: 'Test Student', email: student.email },
      });
      expect((inbox.body as { meta: { total: number } }).meta.total).toBe(1);

      // Another business cannot see or touch it: 404, not 403.
      const otherInbox = await as(otherOwner, ctx.get(`${API}/business/enquiries`)).expect(200);
      expect(successOf(z.array(businessLeadSchema), otherInbox).data).toEqual([]);
      await as(otherOwner, ctx.patch(`${API}/business/enquiries/${receipt.id}`))
        .send({ status: 'CLOSED' })
        .expect(404);

      // Once the business has handled it, the student may enquire again.
      const updated = await as(owner, ctx.patch(`${API}/business/enquiries/${receipt.id}`))
        .send({ status: 'CONTACTED' })
        .expect(200);
      expect(successOf(businessLeadSchema, updated).data.status).toBe('CONTACTED');
      await as(student, ctx.post(`${API}/places/${livePlace.slug}/enquiries`))
        .send(enquiry)
        .expect(201);

      const audit = await ctx.db.auditLog.findMany({
        where: { entityId: receipt.id },
        select: { action: true },
      });
      expect(audit.map((row) => row.action).sort()).toEqual([
        'LEAD_CREATED',
        'LEAD_STATUS_CHANGED',
      ]);
    });

    it('counts enquiries and reviews on the dashboard, and lists reviews of the business’s places', async () => {
      await as(student, ctx.post(`${API}/places/${livePlace.slug}/reviews`))
        .send({ rating: 4, comment: 'Tasty food, fair price.' })
        .expect(201);

      const dashboard = successOf(
        businessDashboardSchema,
        await as(owner, ctx.get(`${API}/business/dashboard`)).expect(200),
      ).data;
      expect(dashboard.profile.businessName).toBe(`E2E Sai Krupa Mess ${run}`);
      expect(dashboard.stats.listings).toMatchObject({ live: 1, underReview: 1, rejected: 0 });
      expect(dashboard.stats.enquiries).toEqual({ total: 2, new: 1 });
      expect(dashboard.stats.reviews).toEqual({ count: 1, averageRating: 4 });

      const reviews = successOf(
        z.array(businessReviewSchema),
        await as(owner, ctx.get(`${API}/business/reviews`)).expect(200),
      ).data;
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        rating: 4,
        comment: 'Tasty food, fair price.',
        place: { id: livePlace.id },
        authorName: 'Test S.',
      });

      const listing = successOf(
        z.array(businessListingSchema),
        await as(owner, ctx.get(`${API}/business/listings`)).expect(200),
      ).data.find((row) => row.id === livePlace.id);
      expect(listing).toMatchObject({ enquiryCount: 2, newEnquiryCount: 1, ratingCount: 1 });
    });
  });
});
