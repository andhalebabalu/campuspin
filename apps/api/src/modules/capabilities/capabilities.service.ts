import { Injectable } from '@nestjs/common';
import {
  CAPABILITY_INFO,
  SERVICE_KIND_CAPABILITIES,
  type BusinessCapabilities,
  type BusinessCapability,
  type BusinessType,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

type Db = Prisma.TransactionClient | PrismaService;

/** The type of a business: staff override, else its category's, else OTHER. */
export function typeOf(row: {
  businessType: BusinessType | null;
  category: { businessType: BusinessType | null } | null;
}): { businessType: BusinessType; typeSource: BusinessCapabilities['typeSource'] } {
  if (row.businessType) return { businessType: row.businessType, typeSource: 'BUSINESS' };
  if (row.category?.businessType) {
    return { businessType: row.category.businessType, typeSource: 'CATEGORY' };
  }
  return { businessType: 'OTHER', typeSource: 'DEFAULT' };
}

export const capabilityRequired = (capabilities: readonly BusinessCapability[]) =>
  AppException.forbidden(
    'CAPABILITY_REQUIRED',
    `This is not available for your business (${capabilities
      .map((capability) => CAPABILITY_INFO[capability].label)
      .join(' or ')}).`,
  );

/**
 * What a business can do: its type's default capabilities (a table, so staff change them without
 * code) with the per-business overrides applied. Every business module checks here, on the
 * server, whatever the dashboard shows.
 */
@Injectable()
export class CapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async forBusiness(
    businessProfileId: string,
    db: Db = this.prisma,
  ): Promise<BusinessCapabilities> {
    const row = await db.businessProfile.findUnique({
      where: { id: businessProfileId },
      select: {
        businessType: true,
        category: { select: { businessType: true } },
        capabilityOverrides: {
          select: { capability: true, enabled: true, note: true },
          orderBy: { capability: 'asc' },
        },
      },
    });
    if (!row) throw AppException.notFound('Business not found');
    const { businessType, typeSource } = typeOf(row);
    const defaults = await db.businessTypeCapability.findMany({
      where: { businessType },
      select: { capability: true },
    });
    const effective = new Set<BusinessCapability>(defaults.map((entry) => entry.capability));
    for (const override of row.capabilityOverrides) {
      if (override.enabled) effective.add(override.capability);
      else effective.delete(override.capability);
    }
    return {
      businessType,
      typeSource,
      capabilities: [...effective].sort(),
      overrides: row.capabilityOverrides,
    };
  }

  async has(
    businessProfileId: string,
    anyOf: readonly BusinessCapability[],
    db: Db = this.prisma,
  ): Promise<boolean> {
    if (anyOf.length === 0) return true;
    const { capabilities } = await this.forBusiness(businessProfileId, db);
    return anyOf.some((capability) => capabilities.includes(capability));
  }

  /** 403 CAPABILITY_REQUIRED unless the business has at least one of `anyOf`. */
  async require(
    businessProfileId: string,
    anyOf: readonly BusinessCapability[],
    db: Db = this.prisma,
  ): Promise<void> {
    if (!(await this.has(businessProfileId, anyOf, db))) throw capabilityRequired(anyOf);
  }

  /**
   * The caller's business for capability checks: the first active one they own or belong to
   * (the same business every `/business/*` route resolves). 404 without one.
   */
  async businessOf(actor: AuthenticatedUser): Promise<string> {
    const business = await this.prisma.businessProfile.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!business)
      throw AppException.notFound('No business profile is linked to this account yet.');
    return business.id;
  }

  async requireForActor(actor: AuthenticatedUser, anyOf: readonly BusinessCapability[]) {
    await this.require(await this.businessOf(actor), anyOf);
  }

  /** The capability a place service kind needs (none for offers and listings). */
  static forServiceKind(kind: string): readonly BusinessCapability[] {
    return SERVICE_KIND_CAPABILITIES[kind] ?? [];
  }

  /**
   * After a business's capabilities change, switches off its place services it may no longer
   * offer, so students stop seeing them everywhere at once. Returns what was switched off. Turning
   * a capability back on does not switch services back on: the owner decides that.
   */
  async syncServices(businessProfileId: string, db: Db = this.prisma): Promise<string[]> {
    const { capabilities } = await this.forBusiness(businessProfileId, db);
    const services = await db.placeService.findMany({
      where: { enabled: true, place: { businessProfileId } },
      select: { id: true, serviceType: { select: { kind: true, key: true } } },
    });
    const off = services.filter((service) => {
      const needs = CapabilitiesService.forServiceKind(service.serviceType.kind);
      return needs.length > 0 && !needs.some((capability) => capabilities.includes(capability));
    });
    if (off.length > 0) {
      await db.placeService.updateMany({
        where: { id: { in: off.map((service) => service.id) } },
        data: { enabled: false },
      });
    }
    return off.map((service) => service.serviceType.key);
  }
}
