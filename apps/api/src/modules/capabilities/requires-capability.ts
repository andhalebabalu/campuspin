import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { BusinessCapability } from '@platform/contracts';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CapabilitiesService } from './capabilities.service.js';

const CAPABILITY_KEY = 'platform:capability';

/**
 * Checks, on the server, that the caller's business has at least one of these capabilities
 * (403 CAPABILITY_REQUIRED otherwise). Runs after the global auth and role guards, so the caller
 * is a signed-in business owner by then. A method's own list replaces its controller's.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const anyOf = this.reflector.getAllAndOverride<BusinessCapability[] | undefined>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!anyOf || anyOf.length === 0) return true;
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) return false;
    await this.capabilities.requireForActor(request.user, anyOf);
    return true;
  }
}

export const RequiresCapability = (...anyOf: BusinessCapability[]) =>
  applyDecorators(SetMetadata(CAPABILITY_KEY, anyOf), UseGuards(CapabilityGuard));

/** Explicitly no capability needed (overrides a controller-level one). */
export const AnyBusiness = () => SetMetadata(CAPABILITY_KEY, []);
