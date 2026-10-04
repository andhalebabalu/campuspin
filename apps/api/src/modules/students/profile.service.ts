import { Injectable } from '@nestjs/common';
import type { Profile, Settings, UpdateProfile, UpdateSettings } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { ImageStorage } from '../../infra/storage/image-storage.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { studentBadge } from './student-rules.js';

/** What a member sees before they change anything: private by default. */
export const DEFAULT_SETTINGS: Settings = {
  profileVisibility: 'STUDENTS',
  showCommunityActivity: true,
  allowMarketplaceMessages: true,
  notifyCommunity: true,
  notifyMarketplace: true,
  notifyEvents: true,
  notifyJobs: true,
  notifyMessages: true,
  notifyPlaceUpdates: true,
};

const COLLEGE = { select: { id: true, slug: true, name: true } } as const;

/**
 * The member's own profile (name, the college they browse, course, year) and settings. Choosing a
 * college here never makes anyone a student of it: only verification sets the verified college.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: ImageStorage,
  ) {}

  async profile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        course: true,
        year: true,
        createdAt: true,
        studentVerifiedUntil: true,
        college: COLLEGE,
        verifiedCollege: COLLEGE,
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      college: user.college,
      course: user.course,
      year: user.year,
      student: studentBadge(user),
      memberSince: user.createdAt.toISOString(),
    };
  }

  async updateProfile(
    dto: UpdateProfile,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<Profile> {
    // A profile photo must be a file this platform stored, never an outside URL.
    if (dto.avatarUrl && !this.images.owns(dto.avatarUrl)) {
      throw AppException.validation({
        avatarUrl: ['Upload the photo here first (POST /uploads/images)'],
      });
    }
    if (dto.collegeId) {
      const college = await this.prisma.college.count({
        where: { id: dto.collegeId, status: 'ACTIVE' },
      });
      if (college === 0)
        throw AppException.validation({ collegeId: ['Choose a college from the list'] });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
          ...(dto.collegeId !== undefined ? { collegeId: dto.collegeId } : {}),
          ...(dto.course !== undefined ? { course: dto.course } : {}),
          ...(dto.year !== undefined ? { year: dto.year } : {}),
        },
      });
      await this.audit.record(
        {
          action: 'PROFILE_UPDATED',
          actorId: actor.id,
          entityType: 'User',
          entityId: actor.id,
          metadata: { changed: Object.keys(dto) },
          client,
        },
        tx,
      );
    });
    return this.profile(actor.id);
  }

  async settings(userId: string): Promise<Settings> {
    const row = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      profileVisibility: row.profileVisibility,
      showCommunityActivity: row.showCommunityActivity,
      allowMarketplaceMessages: row.allowMarketplaceMessages,
      notifyCommunity: row.notifyCommunity,
      notifyMarketplace: row.notifyMarketplace,
      notifyEvents: row.notifyEvents,
      notifyJobs: row.notifyJobs,
      notifyMessages: row.notifyMessages,
      notifyPlaceUpdates: row.notifyPlaceUpdates,
    };
  }

  async updateSettings(
    dto: UpdateSettings,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<Settings> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userSettings.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, ...DEFAULT_SETTINGS, ...dto },
        update: dto,
      });
      await this.audit.record(
        {
          action: 'SETTINGS_UPDATED',
          actorId: actor.id,
          entityType: 'User',
          entityId: actor.id,
          metadata: { changed: Object.keys(dto) },
          client,
        },
        tx,
      );
    });
    return this.settings(actor.id);
  }
}
