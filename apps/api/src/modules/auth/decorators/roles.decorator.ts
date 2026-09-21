import { SetMetadata } from '@nestjs/common';
import type { RoleKey } from '@platform/contracts';

export const ROLES_KEY = 'platform:roles';

/** The caller must hold AT LEAST ONE of these roles (`@Roles('ADMIN', 'SUPER_ADMIN')`). */
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);
