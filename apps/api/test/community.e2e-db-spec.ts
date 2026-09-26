import {
  blockedMemberSchema,
  communityCommentSchema,
  communityPostSchema,
  cursorPageSchema,
  memberProfileSchema,
  notificationSchema,
  reactionSummarySchema,
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
const postPage = cursorPageSchema(communityPostSchema);
const commentPage = cursorPageSchema(communityCommentSchema);

describe('College community (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let collegeA: string;
  let collegeB: string;
  let asha: Persona; // verified, college A
  let ravi: Persona; // verified, college A
  let meera: Persona; // verified, college B
  let guest: Persona; // signed in, not verified

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    const admin = await persona(ctx, 'community-admin', { role: 'ADMIN' });
    collegeA = await makeCollege(ctx, admin, 'Community A');
    collegeB = await makeCollege(ctx, admin, 'Community B');
    asha = await persona(ctx, 'community-asha', { name: 'Asha Kulkarni' });
    ravi = await persona(ctx, 'community-ravi', { name: 'Ravi Deshmukh' });
    meera = await persona(ctx, 'community-meera', { name: 'Meera Joshi' });
    guest = await persona(ctx, 'community-guest', { name: 'Guest User' });
    await verifyStudent(ctx, asha, collegeA);
    await verifyStudent(ctx, ravi, collegeA);
    await verifyStudent(ctx, meera, collegeB);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function writePost(who: Persona, body: Record<string, unknown> = {}) {
    const response = await as(who, ctx.post(`${API}/community/posts`)).send({
      category: 'DISCUSSION',
      title: 'Canteen timings changed?',
      body: 'Does anyone know the new timings?',
      ...body,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(communityPostSchema, response).data;
  }

  describe('writing', () => {
    it('takes the college from the verified account and ignores any collegeId in the body', async () => {
      const response = await as(asha, ctx.post(`${API}/community/posts`)).send({
        category: 'QUESTION',
        title: 'Spoof attempt',
        body: 'Trying to post into another college',
        collegeId: collegeB,
      });
      // The request schema is strict: an unknown collegeId is refused outright.
      expect(response.status).toBe(400);

      const post = await writePost(asha);
      expect(post.college.id).toBe(collegeA);
      expect(post.visibility).toBe('COLLEGE_ONLY');
      expect(post.author.displayName).toBe('Asha K.');
      expect(post.author.verifiedStudent).toBe(true);
      expect(JSON.stringify(post)).not.toContain(asha.email);
    });

    it('refuses members who are not verified students', async () => {
      const response = await as(guest, ctx.post(`${API}/community/posts`)).send({
        category: 'DISCUSSION',
        title: 'Hello',
        body: 'Can I post?',
      });
      expect(errorOf(response).error.code).toBe('STUDENT_VERIFICATION_REQUIRED');
      expect(response.status).toBe(403);
    });

    it('refuses a student whose verification has expired', async () => {
      const lapsed = await persona(ctx, 'community-lapsed');
      await verifyStudent(ctx, lapsed, collegeA);
      await ctx.db.user.update({
        where: { id: lapsed.userId },
        data: { studentVerifiedUntil: new Date(Date.now() - 1000) },
      });
      const response = await as(lapsed, ctx.post(`${API}/community/posts`)).send({
        category: 'DISCUSSION',
        title: 'Still here',
        body: 'My badge expired',
      });
      expect(errorOf(response).error.code).toBe('STUDENT_VERIFICATION_REQUIRED');
    });

    it('requires a start time on events and refuses one elsewhere', async () => {
      const noDate = await as(asha, ctx.post(`${API}/community/posts`)).send({
        category: 'EVENT',
        title: 'Hackathon',
        body: 'Join us',
      });
      expect(errorOf(noDate).error.code).toBe('VALIDATION_ERROR');
      const stray = await as(asha, ctx.post(`${API}/community/posts`)).send({
        category: 'QUESTION',
        title: 'Question',
        body: 'Body',
        eventStartsAt: '2026-10-01T10:00:00.000Z',
      });
      expect(errorOf(stray).error.code).toBe('VALIDATION_ERROR');
    });

    it('notifies classmates of a new event, not students of other colleges', async () => {
      const event = await writePost(asha, {
        category: 'EVENT',
        title: 'Coding club meetup',
        eventStartsAt: '2026-10-05T11:00:00.000Z',
        eventLocation: 'Lab 2',
      });
      expect(event.event).toEqual({ startsAt: '2026-10-05T11:00:00.000Z', location: 'Lab 2' });
      const list = async (who: Persona) =>
        successOf(
          z.array(notificationSchema),
          await as(who, ctx.get(`${API}/me/notifications`)).expect(200),
        ).data;
      expect((await list(ravi)).some((n) => n.link === `/community/posts/${event.id}`)).toBe(true);
      expect((await list(meera)).some((n) => n.link === `/community/posts/${event.id}`)).toBe(
        false,
      );
      expect((await list(asha)).some((n) => n.link === `/community/posts/${event.id}`)).toBe(false);
    });

    it('lets only the author edit or delete a post', async () => {
      const post = await writePost(asha);
      await as(ravi, ctx.patch(`${API}/community/posts/${post.id}`))
        .send({ title: 'Hijacked' })
        .expect(404);
      const edited = successOf(
        communityPostSchema,
        await as(asha, ctx.patch(`${API}/community/posts/${post.id}`))
          .send({ title: 'Canteen timings (updated)' })
          .expect(200),
      ).data;
      expect(edited.title).toBe('Canteen timings (updated)');
      expect(edited.editedAt).not.toBeNull();

      await as(ravi, ctx.delete(`${API}/community/posts/${post.id}`)).expect(404);
      await as(asha, ctx.delete(`${API}/community/posts/${post.id}`)).expect(200);
      await as(asha, ctx.get(`${API}/community/posts/${post.id}`)).expect(404);
    });
  });

  describe('reading', () => {
    let collegeOnly: string;
    let open: string;

    beforeAll(async () => {
      collegeOnly = (await writePost(asha, { title: 'College only post' })).id;
      open = (await writePost(asha, { title: 'Public post', visibility: 'PUBLIC' })).id;
    });

    it('shows a college-only post to classmates and hides it from everyone else', async () => {
      await as(ravi, ctx.get(`${API}/community/posts/${collegeOnly}`)).expect(200);
      await as(meera, ctx.get(`${API}/community/posts/${collegeOnly}`)).expect(404);
      await as(guest, ctx.get(`${API}/community/posts/${collegeOnly}`)).expect(404);
      await ctx.get(`${API}/community/posts/${collegeOnly}`).expect(404);
      await ctx.get(`${API}/community/posts/${collegeOnly}/comments`).expect(404);
    });

    it('shows a public post to anyone, even signed out', async () => {
      await ctx.get(`${API}/community/posts/${open}`).expect(200);
      await as(meera, ctx.get(`${API}/community/posts/${open}`)).expect(200);
    });

    it('feeds my college by default, and public posts to everyone else', async () => {
      const mine = successOf(
        postPage,
        await as(ravi, ctx.get(`${API}/community/posts`)).expect(200),
      ).data.items;
      expect(mine.every((post) => post.college.id === collegeA)).toBe(true);
      expect(mine.map((post) => post.id)).toEqual(expect.arrayContaining([collegeOnly, open]));

      const other = successOf(
        postPage,
        await as(meera, ctx.get(`${API}/community/posts`)).expect(200),
      ).data.items;
      expect(other.map((post) => post.id)).not.toContain(collegeOnly);

      const anonymous = successOf(
        postPage,
        await ctx.get(`${API}/community/posts?collegeId=${collegeA}`).expect(200),
      ).data.items;
      expect(anonymous.every((post) => post.visibility === 'PUBLIC')).toBe(true);
      expect(anonymous.map((post) => post.id)).toContain(open);

      const refused = await as(guest, ctx.get(`${API}/community/posts?scope=college`));
      expect(errorOf(refused).error.code).toBe('STUDENT_VERIFICATION_REQUIRED');
      await ctx.get(`${API}/community/posts?scope=college`).expect(401);
    });

    it('pages with a cursor without repeating or skipping posts', async () => {
      const first = successOf(
        postPage,
        await as(ravi, ctx.get(`${API}/community/posts?limit=2`)).expect(200),
      ).data;
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = successOf(
        postPage,
        await as(ravi, ctx.get(`${API}/community/posts?limit=2&cursor=${first.nextCursor}`)).expect(
          200,
        ),
      ).data;
      const firstIds = first.items.map((post) => post.id);
      expect(second.items.every((post) => !firstIds.includes(post.id))).toBe(true);
      expect(second.items[0]!.id < firstIds[1]!).toBe(true);
    });
  });

  describe('comments, reactions and reports', () => {
    let postId: string;

    beforeAll(async () => {
      postId = (await writePost(asha, { title: 'Notes for DBMS?' })).id;
    });

    it('lets classmates comment and reply, and notifies the author', async () => {
      const comment = successOf(
        communityCommentSchema,
        await as(ravi, ctx.post(`${API}/community/posts/${postId}/comments`))
          .send({ body: 'I have unit 3.' })
          .expect(201),
      ).data;
      await as(asha, ctx.post(`${API}/community/posts/${postId}/comments`))
        .send({ body: 'Thanks!', parentId: comment.id })
        .expect(201);

      const page = successOf(
        commentPage,
        await as(asha, ctx.get(`${API}/community/posts/${postId}/comments`)).expect(200),
      ).data;
      expect(page.items.map((item) => item.body)).toEqual(['I have unit 3.', 'Thanks!']);
      expect(page.items[1]!.parentId).toBe(comment.id);

      const post = successOf(
        communityPostSchema,
        await as(asha, ctx.get(`${API}/community/posts/${postId}`)).expect(200),
      ).data;
      expect(post.commentCount).toBe(2);

      const notes = successOf(
        z.array(notificationSchema),
        await as(asha, ctx.get(`${API}/me/notifications`)).expect(200),
      ).data;
      expect(notes.some((n) => n.title === 'Ravi D. commented on your post')).toBe(true);
    });

    it('keeps students of other colleges out of college-only threads', async () => {
      await as(meera, ctx.post(`${API}/community/posts/${postId}/comments`))
        .send({ body: 'Me too' })
        .expect(404);
    });

    it('counts one reaction per member and lets them change or remove it', async () => {
      const first = successOf(
        reactionSummarySchema,
        await as(ravi, ctx.put(`${API}/community/posts/${postId}/reaction`))
          .send({ type: 'LIKE' })
          .expect(200),
      ).data;
      expect(first).toEqual({ reactionCount: 1, myReaction: 'LIKE' });
      const changed = successOf(
        reactionSummarySchema,
        await as(ravi, ctx.put(`${API}/community/posts/${postId}/reaction`))
          .send({ type: 'HELPFUL' })
          .expect(200),
      ).data;
      expect(changed).toEqual({ reactionCount: 1, myReaction: 'HELPFUL' });
      const removed = successOf(
        reactionSummarySchema,
        await as(ravi, ctx.delete(`${API}/community/posts/${postId}/reaction`)).expect(200),
      ).data;
      expect(removed).toEqual({ reactionCount: 0, myReaction: null });
    });

    it('records a report once, however often it is sent', async () => {
      const send = () =>
        as(ravi, ctx.post(`${API}/community/posts/${postId}/report`)).send({
          reason: 'SPAM',
          description: 'Posted the same thing five times',
        });
      const first = successOf(reportReceiptSchema, await send().expect(200)).data;
      const again = successOf(reportReceiptSchema, await send().expect(200)).data;
      expect(again.id).toBe(first.id);
      expect(first.status).toBe('PENDING');

      const invalid = await as(ravi, ctx.post(`${API}/community/posts/${postId}/report`)).send({
        reason: 'WRONG_PRICE',
      });
      expect(errorOf(invalid).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('blocking and profiles', () => {
    it('hides a blocked member’s posts both ways', async () => {
      const post = await writePost(ravi, { title: 'Ravi post', visibility: 'PUBLIC' });
      const blocked = successOf(
        z.array(blockedMemberSchema),
        await as(asha, ctx.post(`${API}/me/blocks`))
          .send({ userId: ravi.userId })
          .expect(201),
      ).data;
      expect(blocked.map((member) => member.id)).toEqual([ravi.userId]);

      await as(asha, ctx.get(`${API}/community/posts/${post.id}`)).expect(404);
      const ashaFeed = successOf(
        postPage,
        await as(asha, ctx.get(`${API}/community/posts?limit=50`)).expect(200),
      ).data.items;
      expect(ashaFeed.some((item) => item.author.id === ravi.userId)).toBe(false);

      // And Ravi no longer sees Asha.
      const ashaPost = await writePost(asha, { title: 'After block', visibility: 'PUBLIC' });
      await as(ravi, ctx.get(`${API}/community/posts/${ashaPost.id}`)).expect(404);

      await as(asha, ctx.delete(`${API}/me/blocks/${ravi.userId}`)).expect(200);
      await as(asha, ctx.get(`${API}/community/posts/${post.id}`)).expect(200);
    });

    it('refuses blocking yourself', async () => {
      await as(asha, ctx.post(`${API}/me/blocks`))
        .send({ userId: asha.userId })
        .expect(400);
    });

    it('shows a profile without contact details, with course only to the right audience', async () => {
      await as(asha, ctx.patch(`${API}/me/profile`))
        .send({ course: 'BCA', year: 2 })
        .expect(200);
      await as(asha, ctx.patch(`${API}/me/settings`))
        .send({ profileVisibility: 'STUDENTS' })
        .expect(200);

      const toStudent = successOf(
        memberProfileSchema,
        await as(meera, ctx.get(`${API}/members/${asha.userId}`)).expect(200),
      ).data;
      expect(toStudent).toMatchObject({ displayName: 'Asha K.', course: 'BCA', year: 2 });
      expect(JSON.stringify(toStudent)).not.toContain(asha.email);

      const toGuest = successOf(
        memberProfileSchema,
        await ctx.get(`${API}/members/${asha.userId}`).expect(200),
      ).data;
      expect(toGuest.course).toBeNull();
      expect(toGuest.college?.id).toBe(collegeA);
    });
  });
});
