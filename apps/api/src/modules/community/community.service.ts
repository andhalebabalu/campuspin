import { HttpStatus, Injectable } from '@nestjs/common';
import {
  COMMUNITY_CATEGORIES,
  type CommunityChannels,
  type CommunityComment,
  CommunityPost,
  CommunityReportRequest,
  CreateCommentRequest,
  CreateCommunityPostRequest,
  CursorPage,
  ListCommentsQuery,
  ListCommunityPostsQuery,
  MemberProfile,
  ReactionRequest,
  ReactionSummary,
  ReportReceipt,
  UpdateCommunityPostRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BlocksService } from '../safety/blocks.service.js';
import { ReportsService } from '../safety/reports.service.js';
import { DEFAULT_SETTINGS } from '../students/profile.service.js';
import { StudentAccessService, toMemberSummary } from '../students/student-access.service.js';
import {
  POSTS_PER_HOUR,
  cursorPage,
  eventCategoryFor,
  mayReadPost,
  type Viewer,
} from './community-rules.js';

const MEMBER_SELECT = {
  id: true,
  name: true,
  studentVerifiedUntil: true,
  verifiedCollege: { select: { id: true, slug: true, name: true } },
} as const;

const POST_INCLUDE = {
  author: { select: MEMBER_SELECT },
  college: { select: { id: true, slug: true, name: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      status: true,
      authorId: true,
      author: { select: { name: true } },
    },
  },
} as const;

/** A short, single-line preview of a message. */
export const excerptOf = (text: string, max = 120) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Where a message lives in the app: its section of the college chat. */
export const chatLink = (category: string, postId?: string) =>
  `/community?c=${category}${postId ? `#m-${postId}` : ''}`;

type PostRow = Prisma.CommunityPostGetPayload<{ include: typeof POST_INCLUDE }>;

/**
 * College communities. Reading follows the post's visibility (COLLEGE_ONLY: verified students of
 * that college; PUBLIC: anyone), writing needs a verified student, and the college of every post is
 * the author's verified college, read fresh from the database — never from the request.
 */
@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentAccessService,
    private readonly blocks: BlocksService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Who is asking: their verified college (if any) and whom they must not see. */
  async viewer(userId: string | null | undefined): Promise<Viewer> {
    if (!userId) return { userId: null, collegeId: null, hidden: [] };
    const [badge, hidden] = await Promise.all([
      this.students.badge(userId),
      this.blocks.hiddenFrom(userId),
    ]);
    return { userId, collegeId: badge.verified ? (badge.college?.id ?? null) : null, hidden };
  }

  // ── Feed ───────────────────────────────────────────────────────────────────────────────────────

  async feed(
    userId: string | null,
    query: ListCommunityPostsQuery,
  ): Promise<CursorPage<CommunityPost>> {
    const viewer = await this.viewer(userId);
    const where: Prisma.CommunityPostWhereInput = {
      status: 'ACTIVE',
      ...(query.category ? { category: query.category } : {}),
      ...(viewer.hidden.length > 0 ? { authorId: { notIn: viewer.hidden } } : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    if (query.authorId && viewer.hidden.includes(query.authorId)) {
      return { items: [], nextCursor: null };
    }
    if (query.authorId) where.authorId = query.authorId;

    const scope = query.scope ?? (viewer.collegeId ? 'college' : 'public');
    if (scope === 'college') {
      if (!userId) throw AppException.unauthorized();
      if (!viewer.collegeId) await this.students.requireVerified(userId); // throws the right 403
      where.collegeId = viewer.collegeId!;
    } else {
      where.visibility = 'PUBLIC';
      if (query.collegeId) where.collegeId = query.collegeId;
    }

    // A profile's post list respects that member's "show my community activity" switch.
    if (query.authorId && query.authorId !== userId) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: query.authorId },
        select: { showCommunityActivity: true },
      });
      if (settings && !settings.showCommunityActivity) return { items: [], nextCursor: null };
    }

    const rows = await this.prisma.communityPost.findMany({
      where,
      include: POST_INCLUDE,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = cursorPage(rows, query.limit);
    return { items: await this.toPosts(page.items, viewer), nextCursor: page.nextCursor };
  }

  async get(userId: string | null, postId: string): Promise<CommunityPost> {
    const viewer = await this.viewer(userId);
    const row = await this.readablePost(viewer, postId);
    return (await this.toPosts([row], viewer))[0]!;
  }

  /**
   * My college's group chat, one section per category, each with its latest message: the chat
   * list of the community screen. Verified students only.
   */
  async channels(userId: string): Promise<CommunityChannels> {
    const student = await this.students.requireVerified(userId);
    const hidden = await this.blocks.hiddenFrom(userId);
    const where: Prisma.CommunityPostWhereInput = {
      collegeId: student.college.id,
      status: 'ACTIVE',
      ...(hidden.length > 0 ? { authorId: { notIn: hidden } } : {}),
    };
    const [counts, latest] = await Promise.all([
      this.prisma.communityPost.groupBy({ by: ['category'], where, _count: { _all: true } }),
      Promise.all(
        COMMUNITY_CATEGORIES.map((category) =>
          this.prisma.communityPost.findFirst({
            where: { ...where, category },
            orderBy: { id: 'desc' },
            select: {
              id: true,
              title: true,
              body: true,
              createdAt: true,
              authorId: true,
              author: { select: { name: true } },
            },
          }),
        ),
      ),
    ]);
    const countOf = new Map(counts.map((row) => [row.category, row._count._all]));
    return {
      college: student.college,
      channels: COMMUNITY_CATEGORIES.map((category, index) => {
        const last = latest[index];
        return {
          category,
          messageCount: countOf.get(category) ?? 0,
          lastMessage: last
            ? {
                id: last.id,
                text: excerptOf(last.title ?? last.body, 80),
                authorName:
                  last.authorId === userId
                    ? 'You'
                    : toMemberSummary({
                        id: last.authorId,
                        name: last.author.name,
                        studentVerifiedUntil: null,
                        verifiedCollege: null,
                      }).displayName,
                createdAt: last.createdAt.toISOString(),
              }
            : null,
        };
      }),
    };
  }

  // ── Writing posts ──────────────────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateCommunityPostRequest): Promise<CommunityPost> {
    const student = await this.students.requireVerified(userId);
    const recent = await this.prisma.communityPost.count({
      where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= POSTS_PER_HOUR) {
      throw new AppException(
        'RATE_LIMITED',
        `You can send ${POSTS_PER_HOUR} messages an hour. Try again a little later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // A reply quotes a live message from the same section of the same college chat.
    let replyAuthorId: string | null = null;
    if (dto.replyToId) {
      const target = await this.prisma.communityPost.findUnique({
        where: { id: dto.replyToId },
        select: { collegeId: true, category: true, status: true, authorId: true },
      });
      const hidden = await this.blocks.hiddenFrom(userId);
      if (
        !target ||
        target.status !== 'ACTIVE' ||
        target.collegeId !== student.college.id ||
        target.category !== dto.category ||
        hidden.includes(target.authorId)
      ) {
        throw AppException.validation({ replyToId: ['That message is not in this chat'] });
      }
      replyAuthorId = target.authorId;
    }

    const row = await this.prisma.communityPost.create({
      data: {
        authorId: userId,
        collegeId: student.college.id,
        category: dto.category,
        visibility: dto.visibility,
        title: dto.title ?? null,
        replyToId: dto.replyToId ?? null,
        body: dto.body,
        eventStartsAt: dto.eventStartsAt ? new Date(dto.eventStartsAt) : null,
        eventLocation: dto.category === 'EVENT' ? (dto.eventLocation ?? null) : null,
      },
      include: POST_INCLUDE,
    });

    // Events and jobs reach the rest of the college (each member can switch these off).
    // An event only notifies once it has a date: plain chat in the Events section does not.
    const category = eventCategoryFor(dto.category);
    const label = dto.title ?? excerptOf(dto.body, 80);
    if (category && (category !== 'EVENTS' || dto.eventStartsAt)) {
      const classmates = await this.prisma.user.findMany({
        where: {
          verifiedCollegeId: student.college.id,
          studentVerifiedUntil: { gt: new Date() },
          status: 'ACTIVE',
          id: { notIn: [userId, ...(await this.blocks.hiddenFrom(userId))] },
        },
        select: { id: true },
        take: 1000,
      });
      await this.notifications.notifyMany(
        classmates.map((user) => user.id),
        {
          category,
          type: category === 'EVENTS' ? 'community.event' : 'community.job',
          title: category === 'EVENTS' ? `New event: ${label}` : `New opportunity: ${label}`,
          message: `Posted in the ${student.college.name} community.`,
          link: chatLink(dto.category, row.id),
        },
      );
    }

    if (replyAuthorId && replyAuthorId !== userId) {
      await this.notifications.notify({
        userId: replyAuthorId,
        category: 'COMMUNITY',
        type: 'community.reply',
        title: `${toMemberSummary(row.author).displayName} replied to your message`,
        message: excerptOf(dto.body),
        link: chatLink(dto.category, row.id),
      });
    }

    const viewer = { userId, collegeId: student.college.id, hidden: [] };
    return (await this.toPosts([row], viewer))[0]!;
  }

  async update(
    userId: string,
    postId: string,
    dto: UpdateCommunityPostRequest,
  ): Promise<CommunityPost> {
    const post = await this.ownActivePost(userId, postId);
    if (post.category !== 'EVENT' && (dto.eventStartsAt || dto.eventLocation)) {
      throw AppException.validation({ eventStartsAt: ['Only event posts have a date and place'] });
    }
    const row = await this.prisma.communityPost.update({
      where: { id: postId },
      data: {
        ...(dto.visibility ? { visibility: dto.visibility } : {}),
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.body ? { body: dto.body } : {}),
        ...(dto.eventStartsAt ? { eventStartsAt: new Date(dto.eventStartsAt) } : {}),
        ...(dto.eventLocation !== undefined ? { eventLocation: dto.eventLocation } : {}),
        editedAt: new Date(),
      },
      include: POST_INCLUDE,
    });
    return (await this.toPosts([row], await this.viewer(userId)))[0]!;
  }

  /** The author takes their post down. Final: it stays in the table only for reports and audit. */
  async remove(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      select: { authorId: true, status: true },
    });
    if (!post || post.authorId !== userId || post.status === 'REMOVED') {
      throw AppException.notFound('Post not found');
    }
    await this.prisma.communityPost.update({ where: { id: postId }, data: { status: 'REMOVED' } });
  }

  // ── Comments ───────────────────────────────────────────────────────────────────────────────────

  async comments(
    userId: string | null,
    postId: string,
    query: ListCommentsQuery,
  ): Promise<CursorPage<CommunityComment>> {
    const viewer = await this.viewer(userId);
    await this.readablePost(viewer, postId);
    const rows = await this.prisma.communityComment.findMany({
      where: {
        postId,
        status: 'ACTIVE',
        ...(viewer.hidden.length > 0 ? { authorId: { notIn: viewer.hidden } } : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: { author: { select: MEMBER_SELECT } },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const page = cursorPage(rows, query.limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        postId: row.postId,
        parentId: row.parentId,
        body: row.body,
        author: toMemberSummary(row.author),
        mine: row.authorId === userId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async comment(
    userId: string,
    postId: string,
    dto: CreateCommentRequest,
  ): Promise<CommunityComment> {
    const student = await this.students.requireVerified(userId);
    const viewer = {
      userId,
      collegeId: student.college.id,
      hidden: await this.blocks.hiddenFrom(userId),
    };
    const post = await this.readablePost(viewer, postId);
    if (post.status !== 'ACTIVE') {
      throw AppException.conflict('CONFLICT', 'This post is not open for comments.');
    }

    let parentAuthorId: string | null = null;
    if (dto.parentId) {
      const parent = await this.prisma.communityComment.findUnique({
        where: { id: dto.parentId },
        select: { postId: true, parentId: true, status: true, authorId: true },
      });
      if (!parent || parent.postId !== postId || parent.status !== 'ACTIVE') {
        throw AppException.validation({ parentId: ['That comment is not on this post'] });
      }
      if (parent.parentId) {
        throw AppException.validation({ parentId: ['Reply to the comment itself'] });
      }
      if (viewer.hidden.includes(parent.authorId)) throw AppException.notFound('Comment not found');
      parentAuthorId = parent.authorId;
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityComment.create({
        data: { postId, authorId: userId, parentId: dto.parentId ?? null, body: dto.body },
        include: { author: { select: MEMBER_SELECT } },
      });
      await tx.communityPost.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return created;
    });

    const author = toMemberSummary(row.author);
    const link = `/community/posts/${postId}`;
    if (post.authorId !== userId) {
      await this.notifications.notify({
        userId: post.authorId,
        category: 'COMMUNITY',
        type: 'community.comment',
        title: `${author.displayName} commented on your post`,
        message: post.title ?? excerptOf(post.body),
        link,
      });
    }
    if (parentAuthorId && parentAuthorId !== userId && parentAuthorId !== post.authorId) {
      await this.notifications.notify({
        userId: parentAuthorId,
        category: 'COMMUNITY',
        type: 'community.reply',
        title: `${author.displayName} replied to your comment`,
        message: post.title ?? excerptOf(post.body),
        link,
      });
    }

    return {
      id: row.id,
      postId,
      parentId: row.parentId,
      body: row.body,
      author,
      mine: true,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async removeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.communityComment.findUnique({
      where: { id: commentId },
      select: { authorId: true, status: true, postId: true },
    });
    if (!comment || comment.authorId !== userId || comment.status !== 'ACTIVE') {
      throw AppException.notFound('Comment not found');
    }
    await this.prisma.$transaction([
      this.prisma.communityComment.update({
        where: { id: commentId },
        data: { status: 'REMOVED' },
      }),
      this.prisma.communityPost.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);
  }

  // ── Reactions ──────────────────────────────────────────────────────────────────────────────────

  async react(userId: string, postId: string, dto: ReactionRequest): Promise<ReactionSummary> {
    const student = await this.students.requireVerified(userId);
    const viewer = {
      userId,
      collegeId: student.college.id,
      hidden: await this.blocks.hiddenFrom(userId),
    };
    const post = await this.readablePost(viewer, postId);
    if (post.status !== 'ACTIVE') throw AppException.notFound('Post not found');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.communityReaction.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { type: true },
      });
      if (existing) {
        await tx.communityReaction.update({
          where: { postId_userId: { postId, userId } },
          data: { type: dto.type },
        });
      } else {
        await tx.communityReaction.create({ data: { postId, userId, type: dto.type } });
      }
      const updated = await tx.communityPost.update({
        where: { id: postId },
        data: existing ? {} : { reactionCount: { increment: 1 } },
        select: { reactionCount: true },
      });
      return { reactionCount: updated.reactionCount, myReaction: dto.type };
    });
  }

  async unreact(userId: string, postId: string): Promise<ReactionSummary> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.communityReaction.deleteMany({ where: { postId, userId } });
      const post = await tx.communityPost.findUnique({
        where: { id: postId },
        select: { reactionCount: true },
      });
      if (!post) throw AppException.notFound('Post not found');
      if (deleted.count === 0) return { reactionCount: post.reactionCount, myReaction: null };
      const updated = await tx.communityPost.update({
        where: { id: postId },
        data: { reactionCount: { decrement: 1 } },
        select: { reactionCount: true },
      });
      return { reactionCount: updated.reactionCount, myReaction: null };
    });
  }

  // ── Reports ────────────────────────────────────────────────────────────────────────────────────

  async reportPost(
    userId: string,
    postId: string,
    dto: CommunityReportRequest,
    client: ClientContext,
  ): Promise<ReportReceipt> {
    await this.readablePost(await this.viewer(userId), postId);
    return this.reports.create(
      { reporterId: userId, targetType: 'COMMUNITY_POST', targetId: postId, ...dto },
      client,
    );
  }

  async reportComment(
    userId: string,
    commentId: string,
    dto: CommunityReportRequest,
    client: ClientContext,
  ): Promise<ReportReceipt> {
    const comment = await this.prisma.communityComment.findUnique({
      where: { id: commentId },
      select: { postId: true, status: true },
    });
    if (!comment || comment.status !== 'ACTIVE') throw AppException.notFound('Comment not found');
    await this.readablePost(await this.viewer(userId), comment.postId);
    return this.reports.create(
      { reporterId: userId, targetType: 'COMMUNITY_COMMENT', targetId: commentId, ...dto },
      client,
    );
  }

  // ── Member profiles ────────────────────────────────────────────────────────────────────────────

  /**
   * Another member as the viewer may see them. Contact details never appear; course and year follow
   * the member's visibility choice (PUBLIC: anyone, STUDENTS: verified students, PRIVATE: nobody).
   */
  async member(userId: string | null, memberId: string): Promise<MemberProfile> {
    const viewer = await this.viewer(userId);
    if (
      viewer.hidden.includes(memberId) &&
      !(userId && (await this.blocks.blockedByMe(userId, memberId)))
    ) {
      throw AppException.notFound('Member not found');
    }
    const row = await this.prisma.user.findUnique({
      where: { id: memberId },
      select: {
        ...MEMBER_SELECT,
        status: true,
        course: true,
        year: true,
        createdAt: true,
        settings: { select: { profileVisibility: true, showCommunityActivity: true } },
      },
    });
    if (!row || row.status !== 'ACTIVE') throw AppException.notFound('Member not found');

    const settings = row.settings ?? DEFAULT_SETTINGS;
    const self = userId === memberId;
    const showDetails =
      self ||
      settings.profileVisibility === 'PUBLIC' ||
      (settings.profileVisibility === 'STUDENTS' && viewer.collegeId !== null);
    return {
      ...toMemberSummary(row),
      course: showDetails ? row.course : null,
      year: showDetails ? row.year : null,
      memberSince: row.createdAt.toISOString(),
      showsActivity: self || settings.showCommunityActivity,
      blockedByMe: userId ? await this.blocks.blockedByMe(userId, memberId) : false,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  /** The post if this viewer may read it, else 404 (never saying whether it exists elsewhere). */
  private async readablePost(viewer: Viewer, postId: string): Promise<PostRow> {
    const row = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      include: POST_INCLUDE,
    });
    if (!row || !mayReadPost(row, viewer)) throw AppException.notFound('Post not found');
    return row;
  }

  private async ownActivePost(userId: string, postId: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      select: { authorId: true, status: true, category: true },
    });
    if (!post || post.authorId !== userId || post.status === 'REMOVED') {
      throw AppException.notFound('Post not found');
    }
    if (post.status !== 'ACTIVE') {
      throw AppException.conflict('CONFLICT', 'A moderator is reviewing this post.');
    }
    return post;
  }

  private async toPosts(rows: PostRow[], viewer: Viewer): Promise<CommunityPost[]> {
    const reactions =
      viewer.userId && rows.length > 0
        ? await this.prisma.communityReaction.findMany({
            where: { userId: viewer.userId, postId: { in: rows.map((row) => row.id) } },
            select: { postId: true, type: true },
          })
        : [];
    const mine = new Map(reactions.map((reaction) => [reaction.postId, reaction.type]));
    return rows.map((row) => {
      const own = row.authorId === viewer.userId;
      return {
        id: row.id,
        category: row.category,
        visibility: row.visibility,
        title: row.title,
        body: row.body,
        replyTo:
          row.replyTo &&
          row.replyTo.status === 'ACTIVE' &&
          !viewer.hidden.includes(row.replyTo.authorId)
            ? {
                id: row.replyTo.id,
                authorName: toMemberSummary({
                  id: row.replyTo.authorId,
                  name: row.replyTo.author.name,
                  studentVerifiedUntil: null,
                  verifiedCollege: null,
                }).displayName,
                excerpt: excerptOf(row.replyTo.body),
              }
            : null,
        college: row.college,
        author: toMemberSummary(row.author),
        event: row.eventStartsAt
          ? { startsAt: row.eventStartsAt.toISOString(), location: row.eventLocation }
          : null,
        status: row.status,
        moderationNote: own ? row.moderationNote : null,
        commentCount: row.commentCount,
        reactionCount: row.reactionCount,
        myReaction: mine.get(row.id) ?? null,
        mine: own,
        editedAt: row.editedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
