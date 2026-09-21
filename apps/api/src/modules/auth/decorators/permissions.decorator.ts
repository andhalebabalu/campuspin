import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@platform/contracts';

export const PERMISSIONS_KEY = 'platform:permissions';

/**
 * The caller's roles must together grant ALL of these permissions
 * (`@Permissions('places.update', 'places.manage')`). Keys are the seeded ones in `@platform/contracts`.
 */
export const Permissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
