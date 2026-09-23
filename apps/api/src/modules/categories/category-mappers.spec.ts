import {
  adminAmenitySchema,
  adminCategoryGroupSchema,
  adminCategorySchema,
  amenitySchema,
  categoryDetailSchema,
  categoryGroupSchema,
} from '@platform/contracts';
import type {
  AdminAmenityRow,
  AdminDetailRow,
  AdminGroupRow,
  AmenityRow,
  DetailRow,
  GroupRow,
} from './category-mappers.js';
import {
  toAdminAmenity,
  toAdminCategory,
  toAdminCategoryGroup,
  toAmenity,
  toCategoryAttribute,
  toCategoryDetail,
  toCategoryGroup,
  toCategoryRatingDimension,
} from './category-mappers.js';

const attribute = {
  id: 'attr-1',
  key: 'seating_capacity',
  name: 'Seating capacity',
  dataType: 'INTEGER' as const,
  required: false,
  filterable: true,
  searchable: false,
  unit: 'seats',
  options: null,
  helpText: null,
  sortOrder: 0,
};

const dimension = { id: 'dim-1', key: 'food', label: 'Food', sortOrder: 0 };

const detailRow: DetailRow = {
  id: '01a0c600-1111-7000-8000-000000000002',
  slug: 'mess',
  name: 'Mess',
  description: 'Monthly meal plans.',
  icon: 'utensils',
  sortOrder: 0,
  defaultPriceUnit: 'MONTH',
  parentId: '01a0c600-1111-7000-8000-000000000001',
  attributes: [attribute],
  ratingDimensions: [dimension],
};

const adminDetailRow: AdminDetailRow = {
  ...detailRow,
  status: 'ACTIVE',
  createdAt: new Date('2026-09-23T10:00:00.000Z'),
  updatedAt: new Date('2026-09-23T11:00:00.000Z'),
};

const groupRow: GroupRow = {
  id: '01a0c600-1111-7000-8000-000000000001',
  slug: 'food',
  name: 'Food',
  description: 'Everything to eat.',
  icon: 'utensils',
  sortOrder: 0,
  defaultPriceUnit: null,
  children: [
    {
      id: detailRow.id,
      slug: detailRow.slug,
      name: detailRow.name,
      description: detailRow.description,
      icon: detailRow.icon,
      sortOrder: detailRow.sortOrder,
      defaultPriceUnit: detailRow.defaultPriceUnit,
    },
  ],
};

const adminGroupRow: AdminGroupRow = {
  ...groupRow,
  status: 'ACTIVE',
  children: groupRow.children.map((child) => ({ ...child, status: 'ACTIVE' as const })),
};

const amenityRow: AmenityRow = {
  id: 'amenity-1',
  key: 'wifi',
  name: 'WiFi',
  icon: 'wifi',
  sortOrder: 0,
};
const adminAmenityRow: AdminAmenityRow = { ...amenityRow, status: 'ACTIVE' };

describe('toCategoryAttribute', () => {
  it('maps every field and unwraps the options JSON', () => {
    expect(
      toCategoryAttribute({
        ...attribute,
        dataType: 'ENUM',
        options: [{ value: 'a', label: 'A' }],
      }),
    ).toEqual({
      ...attribute,
      dataType: 'ENUM',
      options: [{ value: 'a', label: 'A' }],
    });
  });

  it('a null options column becomes null, not an empty array', () => {
    expect(toCategoryAttribute(attribute).options).toBeNull();
  });
});

describe('toCategoryRatingDimension', () => {
  it('maps every field', () => {
    expect(toCategoryRatingDimension(dimension)).toEqual(dimension);
  });
});

describe('toCategoryGroup', () => {
  it('maps the group and its children', () => {
    const group = toCategoryGroup(groupRow);
    expect(group).toMatchObject({ id: groupRow.id, name: 'Food' });
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toMatchObject({ id: detailRow.id, name: 'Mess' });
    expect(categoryGroupSchema.safeParse(group).success).toBe(true);
  });
});

describe('toAdminCategoryGroup', () => {
  it('adds status to the group and to every child', () => {
    const group = toAdminCategoryGroup(adminGroupRow);
    expect(group.status).toBe('ACTIVE');
    expect(group.children[0]?.status).toBe('ACTIVE');
    expect(adminCategoryGroupSchema.safeParse(group).success).toBe(true);
  });
});

describe('toCategoryDetail', () => {
  it('has exactly the public contract fields: no staff-only field can appear', () => {
    const detail = toCategoryDetail(detailRow);
    expect(Object.keys(detail).sort()).toEqual(Object.keys(categoryDetailSchema.shape).sort());
    expect(detail).not.toHaveProperty('status');
    expect(detail).not.toHaveProperty('createdAt');
    expect(categoryDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('maps attributes and rating dimensions', () => {
    const detail = toCategoryDetail(detailRow);
    expect(detail.attributes).toEqual([toCategoryAttribute(attribute)]);
    expect(detail.ratingDimensions).toEqual([dimension]);
  });

  it('does not copy an unknown column from the row into the response', () => {
    const withExtra = { ...detailRow, internalNote: 'do not show' } as DetailRow;
    expect(JSON.stringify(toCategoryDetail(withExtra))).not.toContain('internalNote');
  });
});

describe('toAdminCategory', () => {
  it('adds the staff fields, with dates as ISO strings', () => {
    const admin = toAdminCategory(adminDetailRow);
    expect(admin).toMatchObject({
      status: 'ACTIVE',
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T11:00:00.000Z',
    });
    expect(adminCategorySchema.safeParse(admin).success).toBe(true);
  });
});

describe('toAmenity / toAdminAmenity', () => {
  it('map every field, and the admin version adds status', () => {
    expect(toAmenity(amenityRow)).toEqual(amenityRow);
    expect(amenitySchema.safeParse(toAmenity(amenityRow)).success).toBe(true);

    const admin = toAdminAmenity(adminAmenityRow);
    expect(admin).toEqual({ ...amenityRow, status: 'ACTIVE' });
    expect(adminAmenitySchema.safeParse(admin).success).toBe(true);
  });
});
