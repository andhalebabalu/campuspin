import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLES,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
} from '@platform/contracts';
import { AMENITIES } from './data/amenities.js';
import { CATEGORY_GROUPS } from './data/categories.js';
import { SERVICE_TYPES } from './data/service-types.js';
import { type Db, required } from './db.js';

/**
 * Reference data: safe to run in every environment, including production. It only creates what is
 * missing. Roles and permissions are system-defined, so their names are kept in sync with the
 * code; categories, attributes and amenities are managed by staff afterwards, so re-running the
 * seed never overwrites their edits.
 */
export async function seedReference(db: Db): Promise<void> {
  await seedRolesAndPermissions(db);
  await seedCategories(db);
  await seedAmenities(db);
  await seedServiceTypes(db);
}

async function seedRolesAndPermissions(db: Db): Promise<void> {
  for (const key of ROLE_KEYS) {
    const { name, description } = ROLES[key];
    await db.role.upsert({
      where: { key },
      update: { name, description, isSystem: true },
      create: { key, name, description, isSystem: true },
    });
  }
  for (const key of PERMISSION_KEYS) {
    const { resource, description } = PERMISSIONS[key];
    await db.permission.upsert({
      where: { key },
      update: { resource, description },
      create: { key, resource, description },
    });
  }

  const roleIds = new Map(
    (await db.role.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );
  const permissionIds = new Map(
    (await db.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );
  // Additive only: never removes a grant that staff may have added through the admin UI later.
  await db.rolePermission.createMany({
    data: ROLE_KEYS.flatMap((role) =>
      ROLE_PERMISSIONS[role].map((permission) => ({
        roleId: required(roleIds, role, 'role'),
        permissionId: required(permissionIds, permission, 'permission'),
      })),
    ),
    skipDuplicates: true,
  });
}

async function seedCategories(db: Db): Promise<void> {
  for (const [groupIndex, group] of CATEGORY_GROUPS.entries()) {
    const parent = await db.category.upsert({
      where: { slug: group.slug },
      update: {},
      create: {
        slug: group.slug,
        name: group.name,
        icon: group.icon,
        description: group.description,
        sortOrder: groupIndex,
      },
    });

    for (const [childIndex, child] of group.children.entries()) {
      const category = await db.category.upsert({
        where: { slug: child.slug },
        update: {},
        create: {
          slug: child.slug,
          name: child.name,
          icon: child.icon,
          description: child.description,
          parentId: parent.id,
          sortOrder: childIndex,
          defaultPriceUnit: child.defaultPriceUnit ?? null,
        },
      });

      for (const [attributeIndex, attribute] of child.attributes.entries()) {
        await db.categoryAttribute.upsert({
          where: { categoryId_key: { categoryId: category.id, key: attribute.key } },
          update: {},
          create: {
            categoryId: category.id,
            key: attribute.key,
            name: attribute.name,
            dataType: attribute.dataType,
            required: attribute.required ?? false,
            filterable: attribute.filterable ?? false,
            searchable: attribute.searchable ?? false,
            unit: attribute.unit ?? null,
            options: attribute.options?.map(({ value, label }) => ({ value, label })),
            helpText: attribute.helpText ?? null,
            sortOrder: attributeIndex,
          },
        });
      }

      for (const [dimensionIndex, dimension] of child.ratingDimensions.entries()) {
        await db.categoryRatingDimension.upsert({
          where: { categoryId_key: { categoryId: category.id, key: dimension.key } },
          update: {},
          create: {
            categoryId: category.id,
            key: dimension.key,
            label: dimension.label,
            sortOrder: dimensionIndex,
          },
        });
      }
    }
  }
}

async function seedAmenities(db: Db): Promise<void> {
  for (const [index, amenity] of AMENITIES.entries()) {
    await db.amenity.upsert({
      where: { key: amenity.key },
      update: {},
      create: { key: amenity.key, name: amenity.name, icon: amenity.icon, sortOrder: index },
    });
  }
}

/** Create-only, like categories: staff edits to names, order or visibility are never overwritten. */
async function seedServiceTypes(db: Db): Promise<void> {
  for (const [index, type] of SERVICE_TYPES.entries()) {
    await db.serviceType.upsert({
      where: { key: type.key },
      update: {},
      create: {
        key: type.key,
        name: type.name,
        description: type.description,
        icon: type.icon,
        kind: type.kind,
        showOnHome: type.showOnHome,
        categorySlug: type.categorySlug ?? null,
        sortOrder: index,
      },
    });
  }
}
