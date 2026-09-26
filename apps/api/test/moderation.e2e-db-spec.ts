import {
  adminCommunityPostSchema,
  adminDashboardSchema,
  adminListingSchema,
  adminReportSchema,
  communityCommentSchema,
  communityPostSchema,
  cursorPageSchema,
  listingSchema,
  notificationSchema,
  reportReceiptSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import {
  type Persona,
  as,
  makeCollege,
  persona,
  verifyStudent,
} from './support/student-fixtures.js';

const API = '/api/v1';
const reports = z.array(adminReportSchema);

describe('Moderation of reports, community and marketplace (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let moderator: Persona;
  let author: Persona;
  let reporter: Persona;
  let classmate: Persona;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    const admin = await persona(ctx, 'mod-admin', { role: 'ADMIN' });
    const college = await makeCollege(ctx, admin, 'Moderation');
    moderator = await persona(ctx, 'mod-moderator', { role: 'MODERATOR' });
    author = await persona(ctx, 'mod-author', { name: 'Arjun Kale' });
    reporter = await persona(ctx, 'mod-reporter', { name: 'Riya Sen' });
    classmate = await persona(ctx, 'mod-classmate', { name: 'Kabir Nair' });
    for (const who of [author, reporter, classmate]) await verifyStudent(ctx, who, college);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function post(title: string) {
    const response = await as(author, ctx.post(`${API}/community/posts`))
      .send({ category: 'DISCUSSION', title, body: 'Body text' })
      .expect(201);
    return successOf(communityPostSchema, response).data;
  }

  async function reportPost(postId: string, who = reporter, reason = 'SPAM') {
    return successOf(
      reportReceiptSchema,
      await as(who, ctx.post(`${API}/community/posts/${postId}/report`))
        .send({ reason })
        .expect(200),
    ).data;
  }

  async function openReportsFor(targetId: string) {
    const response = await as(
      moderator,
      ctx.get(`${API}/admin/reports?status=PENDING&limit=50`),
    ).expect(200);
    return successOf(reports, response).data.filter((report) => report.target.id === targetId);
  }

  it('keeps the moderation screens staff-only', async () => {
    const student = await as(author, ctx.get(`${API}/admin/reports`));
    expect(student.status).toBe(403);
    await as(author, ctx.get(`${API}/admin/community/posts`)).expect(403);
    await as(author, ctx.get(`${API}/admin/marketplace/listings`)).expect(403);
  });

  it('queues a report with a readable summary and counts it on the dashboard', async () => {
    const target = await post('Buy my notes!!!');
    await reportPost(target.id);
    await reportPost(target.id, classmate, 'HARASSMENT');

    const queued = await openReportsFor(target.id);
    expect(queued).toHaveLength(2);
    expect(queued[0]!.target).toMatchObject({
      type: 'COMMUNITY_POST',
      label: 'Buy my notes!!!',
      status: 'ACTIVE',
      owner: { id: author.userId },
      link: `/community/posts/${target.id}`,
    });
    expect(queued[0]!.openReportsOnTarget).toBe(2);

    const dashboard = successOf(
      adminDashboardSchema,
      await as(moderator, ctx.get(`${API}/admin/dashboard`)).expect(200),
    ).data;
    expect(dashboard.queues.openReports).toBeGreaterThanOrEqual(2);
  });

  it('hides the content from a report, closes every report on it and tells the author', async () => {
    const target = await post('Rude post');
    const first = await reportPost(target.id);
    await reportPost(target.id, classmate);

    const resolved = successOf(
      adminReportSchema,
      await as(moderator, ctx.post(`${API}/admin/reports/${first.id}/resolve`))
        .send({ action: 'HIDE', note: 'Personal attack' })
        .expect(200),
    ).data;
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.target.status).toBe('HIDDEN');
    expect(await openReportsFor(target.id)).toHaveLength(0);

    await as(classmate, ctx.get(`${API}/community/posts/${target.id}`)).expect(404);
    const own = successOf(
      communityPostSchema,
      await as(author, ctx.get(`${API}/community/posts/${target.id}`)).expect(200),
    ).data;
    expect(own).toMatchObject({ status: 'HIDDEN', moderationNote: 'Personal attack' });

    const notes = successOf(
      z.array(notificationSchema),
      await as(author, ctx.get(`${API}/me/notifications`)).expect(200),
    ).data;
    expect(notes.some((note) => note.title === 'A moderator hid your post')).toBe(true);

    await as(moderator, ctx.post(`${API}/admin/reports/${first.id}/resolve`))
      .send({ action: 'NONE', note: 'Again' })
      .expect(409);
  });

  it('dismisses a report without touching the content', async () => {
    const target = await post('Fine post');
    const report = await reportPost(target.id);
    const dismissed = successOf(
      adminReportSchema,
      await as(moderator, ctx.post(`${API}/admin/reports/${report.id}/dismiss`))
        .send({ note: 'Nothing wrong' })
        .expect(200),
    ).data;
    expect(dismissed.status).toBe('DISMISSED');
    await as(classmate, ctx.get(`${API}/community/posts/${target.id}`)).expect(200);
  });

  it('hides, restores and removes posts from the community screen', async () => {
    const target = await post('Borderline post');
    const hide = successOf(
      adminCommunityPostSchema,
      await as(moderator, ctx.post(`${API}/admin/community/posts/${target.id}/hide`))
        .send({ reason: 'Checking' })
        .expect(200),
    ).data;
    expect(hide.status).toBe('HIDDEN');
    await as(moderator, ctx.post(`${API}/admin/community/posts/${target.id}/hide`))
      .send({ reason: 'Twice' })
      .expect(409);

    const restored = successOf(
      adminCommunityPostSchema,
      await as(moderator, ctx.post(`${API}/admin/community/posts/${target.id}/restore`))
        .send({})
        .expect(200),
    ).data;
    expect(restored).toMatchObject({ status: 'ACTIVE', moderationNote: null });

    await as(moderator, ctx.post(`${API}/admin/community/posts/${target.id}/remove`))
      .send({ reason: 'Spam' })
      .expect(200);
    await as(moderator, ctx.post(`${API}/admin/community/posts/${target.id}/restore`))
      .send({})
      .expect(409);
    await as(author, ctx.get(`${API}/community/posts/${target.id}`)).expect(404);

    const missingReason = await as(
      moderator,
      ctx.post(`${API}/admin/community/posts/${target.id}/hide`),
    ).send({});
    expect(errorOf(missingReason).error.code).toBe('VALIDATION_ERROR');
  });

  it('removes a reported comment and keeps the count right', async () => {
    const target = await post('Thread');
    const comment = successOf(
      communityCommentSchema,
      await as(classmate, ctx.post(`${API}/community/posts/${target.id}/comments`))
        .send({ body: 'Nasty comment' })
        .expect(201),
    ).data;
    const report = successOf(
      reportReceiptSchema,
      await as(reporter, ctx.post(`${API}/community/comments/${comment.id}/report`))
        .send({ reason: 'HARASSMENT' })
        .expect(200),
    ).data;
    await as(moderator, ctx.post(`${API}/admin/reports/${report.id}/resolve`))
      .send({ action: 'REMOVE', note: 'Harassment' })
      .expect(200);

    const thread = successOf(
      cursorPageSchema(communityCommentSchema),
      await as(author, ctx.get(`${API}/community/posts/${target.id}/comments`)).expect(200),
    ).data;
    expect(thread.items).toHaveLength(0);
    const after = successOf(
      communityPostSchema,
      await as(author, ctx.get(`${API}/community/posts/${target.id}`)).expect(200),
    ).data;
    expect(after.commentCount).toBe(0);
  });

  it('hides and restores a reported marketplace listing', async () => {
    const listing = successOf(
      listingSchema,
      await as(author, ctx.post(`${API}/marketplace/listings`))
        .send({
          title: 'Too good to be true phone',
          description: 'Pay in advance',
          category: 'ELECTRONICS',
          condition: 'NEW',
          price: 500,
        })
        .expect(201),
    ).data;
    await as(reporter, ctx.post(`${API}/marketplace/listings/${listing.id}/report`))
      .send({ reason: 'SCAM' })
      .expect(200);

    const reportedOnly = successOf(
      z.array(adminListingSchema),
      await as(
        moderator,
        ctx.get(`${API}/admin/marketplace/listings?reported=true&limit=50`),
      ).expect(200),
    ).data;
    expect(reportedOnly.find((item) => item.id === listing.id)?.openReports).toBe(1);

    await as(moderator, ctx.post(`${API}/admin/marketplace/listings/${listing.id}/hide`))
      .send({ reason: 'Suspected scam' })
      .expect(200);
    await as(classmate, ctx.get(`${API}/marketplace/listings/${listing.id}`)).expect(404);
    expect(await openReportsFor(listing.id)).toHaveLength(0);

    await as(moderator, ctx.post(`${API}/admin/marketplace/listings/${listing.id}/restore`))
      .send({})
      .expect(200);
    await as(classmate, ctx.get(`${API}/marketplace/listings/${listing.id}`)).expect(200);
  });

  it('points member reports to the users screen instead of hiding anything', async () => {
    const listing = successOf(
      listingSchema,
      await as(author, ctx.post(`${API}/marketplace/listings`))
        .send({
          title: 'Lamp',
          description: 'Desk lamp',
          category: 'HOSTEL_ESSENTIALS',
          condition: 'GOOD',
          price: 100,
        })
        .expect(201),
    ).data;
    const conversation = await as(
      reporter,
      ctx.post(`${API}/marketplace/listings/${listing.id}/conversations`),
    )
      .send({ message: 'Hi' })
      .expect(201);
    const conversationId = (conversation.body as { data: { id: string } }).data.id;
    const report = successOf(
      reportReceiptSchema,
      await as(author, ctx.post(`${API}/me/conversations/${conversationId}/report`))
        .send({ reason: 'HARASSMENT' })
        .expect(200),
    ).data;
    const queued = (await openReportsFor(reporter.userId)).find((item) => item.id === report.id);
    expect(queued?.target).toMatchObject({ type: 'USER', owner: { id: reporter.userId } });

    await as(moderator, ctx.post(`${API}/admin/reports/${report.id}/resolve`))
      .send({ action: 'HIDE', note: 'x' })
      .expect(400);
    await as(moderator, ctx.post(`${API}/admin/reports/${report.id}/resolve`))
      .send({ action: 'NONE', note: 'Warned by email' })
      .expect(200);
  });
});
