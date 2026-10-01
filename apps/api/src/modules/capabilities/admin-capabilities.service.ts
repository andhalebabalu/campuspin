import { Injectable } from '@nestjs/common';
import {
  BUSINESS_TYPES,
  type BusinessCapabilities,
  type BusinessCapability,
  type BusinessType,
  type BusinessTypeDefaults,
  type SetCapabilityOverrideRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CapabilitiesService, typeOf } from './capabilities.service.js';

const notFound = () => AppException.notFound('Business not found');

/**
 * Staff control of capabilities: a business's type, per-business overrides, and each type's
 * defaults. Every change is audited, and services a business may no longer offer are switched off
 * in the same transaction.
 */
@Injectable()
export class AdminCapabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilitiesService,
    private readonly audit: AuditService,
  ) {}

  forBusiness(id: string): Promise<BusinessCapabilities> {
    return this.capabilities.forBusiness(id);
  }

  async setType(
    id: string,
    businessType: BusinessType | null,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BusinessCapabilities> {
    const current = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: { businessType: true },
    });
    if (!current) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.businessProfile.update({ where: { id }, data: { businessType } });
      const switchedOff = await this.capabilities.syncServices(id, tx);
      await this.audit.record(
        {
          action: 'BUSINESS_TYPE_CHANGED',
          actorId: actor.id,
          entityType: 'BusinessProfile',
          entityId: id,
          metadata: { from: current.businessType, to: businessType, switchedOff },
          client,
        },
        tx,
      );
    });
    return this.capabilities.forBusiness(id);
  }

  async setOverride(
    id: string,
    capability: BusinessCapability,
    dto: SetCapabilityOverrideRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BusinessCapabilities> {
    const exists = await this.prisma.businessProfile.count({ where: { id } });
    if (exists === 0) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      if (dto.enabled === null) {
        await tx.businessCapabilityOverride.deleteMany({
          where: { businessProfileId: id, capability },
        });
      } else {
        await tx.businessCapabilityOverride.upsert({
          where: { businessProfileId_capability: { businessProfileId: id, capability } },
          create: {
            businessProfileId: id,
            capability,
            enabled: dto.enabled,
            note: dto.note ?? null,
            setById: actor.id,
          },
          update: { enabled: dto.enabled, note: dto.note ?? null, setById: actor.id },
        });
      }
      const switchedOff = await this.capabilities.syncServices(id, tx);
      await this.audit.record(
        {
          action: 'BUSINESS_CAPABILITY_CHANGED',
          actorId: actor.id,
          entityType: 'BusinessProfile',
          entityId: id,
          metadata: {
            capability,
            enabled: dto.enabled,
            ...(dto.note ? { note: dto.note } : {}),
            switchedOff,
          },
          client,
        },
        tx,
      );
    });
    return this.capabilities.forBusiness(id);
  }

  async typeDefaults(): Promise<BusinessTypeDefaults[]> {
    const [rows, businesses] = await Promise.all([
      this.prisma.businessTypeCapability.findMany({
        select: { businessType: true, capability: true },
        orderBy: { capability: 'asc' },
      }),
      this.prisma.businessProfile.findMany({
        select: { businessType: true, category: { select: { businessType: true } } },
      }),
    ]);
    const counts = new Map<BusinessType, number>();
    for (const business of businesses) {
      const { businessType } = typeOf(business);
      counts.set(businessType, (counts.get(businessType) ?? 0) + 1);
    }
    return BUSINESS_TYPES.map((businessType) => ({
      businessType,
      capabilities: rows
        .filter((row) => row.businessType === businessType)
        .map((row) => row.capability),
      businessCount: counts.get(businessType) ?? 0,
    }));
  }

  /** Replaces a type's defaults, then switches off services its businesses may no longer offer. */
  async setTypeDefaults(
    businessType: BusinessType,
    capabilities: BusinessCapability[],
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BusinessTypeDefaults[]> {
    const unique = [...new Set(capabilities)];
    await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.businessTypeCapability.findMany({
          where: { businessType },
          select: { capability: true },
        });
        await tx.businessTypeCapability.deleteMany({ where: { businessType } });
        if (unique.length > 0) {
          await tx.businessTypeCapability.createMany({
            data: unique.map((capability) => ({ businessType, capability })),
          });
        }
        const affected = await tx.businessProfile.findMany({
          where: {
            OR: [
              { businessType },
              { businessType: null, category: { businessType } },
              ...(businessType === 'OTHER'
                ? [
                    {
                      businessType: null,
                      OR: [{ categoryId: null }, { category: { businessType: null } }],
                    },
                  ]
                : []),
            ],
          },
          select: { id: true },
        });
        for (const business of affected) await this.capabilities.syncServices(business.id, tx);
        await this.audit.record(
          {
            action: 'BUSINESS_TYPE_DEFAULTS_CHANGED',
            actorId: actor.id,
            entityType: 'BusinessType',
            entityId: null,
            metadata: {
              businessType,
              from: before.map((row) => row.capability),
              to: unique,
              businesses: affected.length,
            },
            client,
          },
          tx,
        );
      },
      { timeout: 30_000 },
    );
    return this.typeDefaults();
  }
}
