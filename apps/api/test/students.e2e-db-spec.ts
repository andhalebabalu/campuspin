import { randomUUID } from 'node:crypto';
import {
  adminCollegeSchema,
  adminStudentVerificationSchema,
  authUserSchema,
  collegeEmailDomainSchema,
  notificationSchema,
  profileSchema,
  settingsSchema,
  studentStatusSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  bearer,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';

const API = '/api/v1';
const run = randomUUID().slice(0, 6);
let sequence = 0;
// "E2E ..." names give "e2e-..." slugs, which the shared cleanup removes (domains cascade).
const collegeName = (label: string) => `E2E Student College ${run} ${label} ${(sequence += 1)}`;
const DOMAIN = `e2e-${run}.edu.in`;
const OTHER_DOMAIN = `e2e-${run}-other.edu.in`;
let mailbox = 0;
const collegeEmail = (domain = DOMAIN) => `student${(mailbox += 1)}@${domain}`;

/** A real 1×1 PNG: the upload is checked by its bytes, not its name. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

interface Persona {
  userId: string;
  token: string;
  email: string;
  password: string;
}

describe('Student verification, profile, settings and notifications (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let admin: Persona;
  let moderator: Persona;
  let collegeId: string;
  let otherCollegeId: string;

  async function persona(label: string, role?: string): Promise<Persona> {
    const account = await registerAndVerify(ctx, { label, name: 'Asha Kulkarni' });
    if (role) await grantRole(ctx.db, account.userId, role);
    const { accessToken } = await login(ctx, account);
    return { ...account, token: accessToken };
  }

  const as = <T extends { set: (name: string, value: string) => T }>(who: Persona, req: T): T =>
    req.set('Authorization', bearer(who.token));

  async function makeCollege(label: string) {
    const response = await as(admin, ctx.post(`${API}/admin/colleges`)).send({
      name: collegeName(label),
      address: 'Test Road, Testville',
      city: 'Testville',
      state: 'Maharashtra',
      latitude: 21.2,
      longitude: 77.4,
      status: 'ACTIVE',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(adminCollegeSchema, response).data.id;
  }

  /** The 6-digit code in the latest email to an address. */
  function codeSentTo(address: string): string {
    const email = ctx.mail.latestTo(address);
    const match = email ? /\b(\d{6})\b/.exec(email.text) : null;
    if (!match?.[1]) throw new Error(`No code was emailed to ${address}`);
    return match[1];
  }

  async function verifyByEmail(who: Persona, address = collegeEmail()) {
    await as(who, ctx.post(`${API}/me/student-verification/email`))
      .send({ collegeId, email: address })
      .expect(200);
    const response = await as(who, ctx.post(`${API}/me/student-verification/email/confirm`))
      .send({ code: codeSentTo(address) })
      .expect(200);
    return successOf(studentStatusSchema, response).data;
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    admin = await persona('stu-admin', 'ADMIN');
    moderator = await persona('stu-moderator', 'MODERATOR');
    collegeId = await makeCollege('Main');
    otherCollegeId = await makeCollege('Other');
    await as(admin, ctx.post(`${API}/admin/colleges/${collegeId}/email-domains`))
      .send({ domain: DOMAIN })
      .expect(201);
    await as(admin, ctx.post(`${API}/admin/colleges/${otherCollegeId}/email-domains`))
      .send({ domain: OTHER_DOMAIN })
      .expect(201);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // ── Access control ─────────────────────────────────────────────────────────────────────────────

  describe('access control', () => {
    it('every /me route needs a session', async () => {
      for (const path of [
        '/me/student-verification',
        '/me/profile',
        '/me/settings',
        '/me/notifications',
      ]) {
        expect((await ctx.get(`${API}${path}`)).status).toBe(401);
      }
    });

    it('staff review needs verifications.review: a student gets 403, a moderator gets in', async () => {
      const student = await persona('stu-plain');
      const id = randomUUID();
      for (const [method, path] of [
        ['get', '/admin/student-verifications'],
        ['get', `/admin/student-verifications/${id}/document`],
        ['post', `/admin/student-verifications/${id}/approve`],
        ['get', `/admin/colleges/${collegeId}/email-domains`],
      ] as const) {
        const response = await as(student, ctx[method](`${API}${path}`));
        expect(response.status, `${method} ${path}`).toBe(403);
      }
      expect((await as(moderator, ctx.get(`${API}/admin/student-verifications`))).status).toBe(200);
    });
  });

  // ── College email ──────────────────────────────────────────────────────────────────────────────

  describe('college email verification', () => {
    it('verifies a student with a code sent to an official address, and the badge follows everywhere', async () => {
      const student = await persona('stu-email');
      const address = collegeEmail();
      const sent = await as(student, ctx.post(`${API}/me/student-verification/email`))
        .send({ collegeId, email: address })
        .expect(200);
      const pending = successOf(studentStatusSchema, sent).data;
      expect(pending.state).toBe('PENDING');
      expect(pending.pending?.collegeEmail).toMatch(/^st\*\*\*@/);
      expect(JSON.stringify(sent.body)).not.toMatch(/codeHash|\b\d{6}\b(?!.*T)/);

      // A wrong code costs a try; the right one verifies.
      const wrong = await as(
        student,
        ctx.post(`${API}/me/student-verification/email/confirm`),
      ).send({
        code: codeSentTo(address) === '000000' ? '111111' : '000000',
      });
      expect(wrong.status).toBe(400);
      expect(JSON.stringify(errorOf(wrong).error.details)).toMatch(/4 tries left/);

      const done = await as(student, ctx.post(`${API}/me/student-verification/email/confirm`))
        .send({ code: codeSentTo(address) })
        .expect(200);
      const status = successOf(studentStatusSchema, done).data;
      expect(status.state).toBe('VERIFIED');
      expect(status.badge).toMatchObject({ verified: true, college: { id: collegeId } });

      const me = successOf(
        authUserSchema,
        await as(student, ctx.get(`${API}/auth/me`)).expect(200),
      ).data;
      expect(me.student).toMatchObject({ verified: true, college: { id: collegeId } });

      const again = await as(student, ctx.post(`${API}/me/student-verification/email`)).send({
        collegeId,
        email: collegeEmail(),
      });
      expect(errorOf(again).error.code).toBe('ALREADY_VERIFIED');

      const notices = successOf(
        z.array(notificationSchema),
        await as(student, ctx.get(`${API}/me/notifications`)).expect(200),
      ).data;
      expect(notices[0]).toMatchObject({
        type: 'student.verified',
        read: false,
        link: '/me/verification',
      });
    });

    it("refuses an address outside the college domains, or on another college's domain", async () => {
      const student = await persona('stu-wrong-domain');
      for (const email of ['asha@gmail.com', collegeEmail(OTHER_DOMAIN), `asha@not${DOMAIN}`]) {
        const response = await as(student, ctx.post(`${API}/me/student-verification/email`)).send({
          collegeId,
          email,
        });
        expect(response.status, email).toBe(400);
        expect(errorOf(response).error.details).toMatchObject({
          fields: { email: [expect.any(String)] },
        });
      }
    });

    it('accepts a subdomain of an official domain', async () => {
      const student = await persona('stu-subdomain');
      const status = await verifyByEmail(student, `asha@students.${DOMAIN}`);
      expect(status.state).toBe('VERIFIED');
    });

    it('lets one college mailbox verify only one account', async () => {
      const first = await persona('stu-mailbox-a');
      const second = await persona('stu-mailbox-b');
      const shared = collegeEmail();
      await verifyByEmail(first, shared);
      const response = await as(second, ctx.post(`${API}/me/student-verification/email`)).send({
        collegeId,
        email: shared,
      });
      expect(response.status).toBe(409);
    });

    it('refuses an expired code, and too many wrong codes', async () => {
      const student = await persona('stu-expired');
      const address = collegeEmail();
      await as(student, ctx.post(`${API}/me/student-verification/email`))
        .send({ collegeId, email: address })
        .expect(200);
      await ctx.db.studentVerification.updateMany({
        where: { userId: student.userId, status: 'PENDING' },
        data: { codeExpiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await as(
        student,
        ctx.post(`${API}/me/student-verification/email/confirm`),
      ).send({
        code: codeSentTo(address),
      });
      expect(errorOf(expired).error.code).toBe('TOKEN_EXPIRED');

      const again = collegeEmail();
      await as(student, ctx.post(`${API}/me/student-verification/email`))
        .send({ collegeId, email: again })
        .expect(200);
      const right = codeSentTo(again);
      const wrongCode = right === '999999' ? '888888' : '999999';
      for (let i = 0; i < 5; i += 1) {
        await as(student, ctx.post(`${API}/me/student-verification/email/confirm`)).send({
          code: wrongCode,
        });
      }
      const locked = await as(
        student,
        ctx.post(`${API}/me/student-verification/email/confirm`),
      ).send({ code: right });
      expect(locked.status).toBe(400);
      const status = successOf(
        studentStatusSchema,
        await as(student, ctx.get(`${API}/me/student-verification`)),
      ).data;
      expect(status.state).toBe('UNVERIFIED');
    });
  });

  // ── ID photo ──────────────────────────────────────────────────────────────────────────────────

  describe('student ID verification', () => {
    function submit(who: Persona, bytes = PNG) {
      return as(who, ctx.post(`${API}/me/student-verification/document`))
        .field('collegeId', collegeId)
        .attach('file', bytes, { filename: 'id.png', contentType: 'image/png' });
    }

    it('keeps the photo private, lets a reviewer open it, and deletes it on approval', async () => {
      const student = await persona('stu-doc');
      const submitted = await submit(student);
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      expect(successOf(studentStatusSchema, submitted).data.pending?.method).toBe('DOCUMENT');

      const row = await ctx.db.studentVerification.findFirstOrThrow({
        where: { userId: student.userId, status: 'PENDING' },
      });
      // Nothing public: the stored reference is a private key, not a URL.
      expect(row.documentKey).toMatch(/^[0-9a-f-]{36}\.png$/);
      expect(JSON.stringify(submitted.body)).not.toContain(row.documentKey ?? 'x');

      // The student cannot open it (not staff); the reviewer can.
      expect(
        (await as(student, ctx.get(`${API}/admin/student-verifications/${row.id}/document`)))
          .status,
      ).toBe(403);
      const document = await as(
        moderator,
        ctx.get(`${API}/admin/student-verifications/${row.id}/document`),
      );
      expect(document.status).toBe(200);
      expect(document.headers['content-type']).toBe('image/png');
      expect(document.headers['cache-control']).toContain('no-store');

      const approved = await as(
        moderator,
        ctx.post(`${API}/admin/student-verifications/${row.id}/approve`),
      )
        .send({})
        .expect(200);
      expect(successOf(adminStudentVerificationSchema, approved).data).toMatchObject({
        status: 'VERIFIED',
        hasDocument: false,
      });
      expect(
        (await as(moderator, ctx.get(`${API}/admin/student-verifications/${row.id}/document`)))
          .status,
      ).toBe(404);
      const me = successOf(authUserSchema, await as(student, ctx.get(`${API}/auth/me`))).data;
      expect(me.student.verified).toBe(true);
      expect(
        await ctx.db.auditLog.count({
          where: { action: 'STUDENT_DOCUMENT_VIEWED', entityId: row.id },
        }),
      ).toBe(1);
    });

    it('refuses a file that is not an image', async () => {
      const student = await persona('stu-doc-bad');
      const response = await submit(student, Buffer.from('%PDF-1.4 not an image'));
      expect(response.status).toBe(415);
    });

    it('rejects with a reason only the student sees, and a second decision is a 409', async () => {
      const student = await persona('stu-doc-reject');
      await submit(student).expect(200);
      const row = await ctx.db.studentVerification.findFirstOrThrow({
        where: { userId: student.userId, status: 'PENDING' },
      });
      expect(
        (
          await as(moderator, ctx.post(`${API}/admin/student-verifications/${row.id}/reject`)).send(
            {},
          )
        ).status,
      ).toBe(400);
      await as(moderator, ctx.post(`${API}/admin/student-verifications/${row.id}/reject`))
        .send({ reason: 'The photo is too blurry.' })
        .expect(200);
      const status = successOf(
        studentStatusSchema,
        await as(student, ctx.get(`${API}/me/student-verification`)),
      ).data;
      expect(status).toMatchObject({
        state: 'UNVERIFIED',
        lastDecision: { status: 'REJECTED', reviewNote: 'The photo is too blurry.' },
      });
      expect(
        (
          await as(
            moderator,
            ctx.post(`${API}/admin/student-verifications/${row.id}/approve`),
          ).send({})
        ).status,
      ).toBe(409);
    });

    it('can send a verified student back to verify again', async () => {
      const student = await persona('stu-reverify');
      await verifyByEmail(student);
      const row = await ctx.db.studentVerification.findFirstOrThrow({
        where: { userId: student.userId, status: 'VERIFIED' },
      });
      await as(
        moderator,
        ctx.post(`${API}/admin/student-verifications/${row.id}/request-reverification`),
      )
        .send({ reason: 'Please confirm you are still enrolled.' })
        .expect(200);
      const me = successOf(authUserSchema, await as(student, ctx.get(`${API}/auth/me`))).data;
      expect(me.student.verified).toBe(false);
    });

    it('cancelling a waiting request deletes it', async () => {
      const student = await persona('stu-cancel');
      await submit(student).expect(200);
      const status = successOf(
        studentStatusSchema,
        await as(student, ctx.delete(`${API}/me/student-verification`)).expect(200),
      ).data;
      expect(status.pending).toBeNull();
      expect(
        await ctx.db.studentVerification.count({
          where: { userId: student.userId, documentKey: { not: null } },
        }),
      ).toBe(0);
    });
  });

  // ── Profile, settings, domains, notifications ─────────────────────────────────────────────────

  describe('profile and settings', () => {
    it('choosing another college to browse never changes the verified college', async () => {
      const student = await persona('stu-profile');
      await verifyByEmail(student);
      const updated = successOf(
        profileSchema,
        await as(student, ctx.patch(`${API}/me/profile`))
          .send({ collegeId: otherCollegeId, course: 'BCA', year: 2 })
          .expect(200),
      ).data;
      expect(updated.college?.id).toBe(otherCollegeId);
      expect(updated.student.college?.id).toBe(collegeId);
      expect(JSON.stringify(updated)).not.toMatch(/passwordHash|documentKey/);
    });

    it('settings start private-by-default and change field by field; notifications respect them', async () => {
      const student = await persona('stu-settings');
      const defaults = successOf(
        settingsSchema,
        await as(student, ctx.get(`${API}/me/settings`)).expect(200),
      ).data;
      expect(defaults.profileVisibility).toBe('STUDENTS');
      const changed = successOf(
        settingsSchema,
        await as(student, ctx.patch(`${API}/me/settings`))
          .send({ notifyMarketplace: false })
          .expect(200),
      ).data;
      expect(changed).toMatchObject({ notifyMarketplace: false, notifyCommunity: true });
      expect((await as(student, ctx.patch(`${API}/me/settings`)).send({ email: 'x' })).status).toBe(
        400,
      );
    });

    it("marks notifications read, and never someone else's", async () => {
      const student = await persona('stu-notify');
      const other = await persona('stu-notify-other');
      await verifyByEmail(student);
      const [notice] = successOf(
        z.array(notificationSchema),
        await as(student, ctx.get(`${API}/me/notifications`)),
      ).data;
      if (!notice) throw new Error('expected a notification');
      expect((await as(other, ctx.post(`${API}/me/notifications/${notice.id}/read`))).status).toBe(
        404,
      );
      const read = await as(student, ctx.post(`${API}/me/notifications/${notice.id}/read`)).expect(
        200,
      );
      expect((read.body as { data: { unread: number } }).data.unread).toBe(0);
    });

    it('a domain belongs to one college only', async () => {
      const response = await as(
        admin,
        ctx.post(`${API}/admin/colleges/${otherCollegeId}/email-domains`),
      ).send({
        domain: DOMAIN,
      });
      expect(response.status).toBe(400);
      const domains = successOf(
        z.array(collegeEmailDomainSchema),
        await as(admin, ctx.get(`${API}/admin/colleges/${collegeId}/email-domains`)).expect(200),
      ).data;
      expect(domains.map((d) => d.domain)).toEqual([DOMAIN]);
    });
  });
});
