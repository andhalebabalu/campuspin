import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_DATA_TYPES,
  MAX_ATTRIBUTE_OPTIONS,
  PRICE_UNITS,
  amenityActionRequestSchema,
  categoryActionRequestSchema,
  categoryIdOrSlugSchema,
  categoryOptionSchema,
  categorySlugSchema,
  createAmenityRequestSchema,
  createCategoryAttributeRequestSchema,
  createCategoryRatingDimensionRequestSchema,
  createCategoryRequestSchema,
  updateAmenityRequestSchema,
  updateCategoryAttributeRequestSchema,
  updateCategoryRatingDimensionRequestSchema,
  updateCategoryRequestSchema,
} from './index.js';

const messagesOf = (result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
}) => (result.error?.issues ?? []).map((issue) => issue.path.join('.'));

describe('categorySlugSchema and categoryIdOrSlugSchema', () => {
  it('accepts a normal slug, lower-cased', () => {
    expect(categorySlugSchema.parse('Mess')).toBe('mess');
  });

  it('allows a 2-character slug (shorter than a college slug)', () => {
    expect(categorySlugSchema.safeParse('pg').success).toBe(true);
  });

  it('rejects an id-shaped slug', () => {
    expect(categorySlugSchema.safeParse('01a0babd-b2d2-725f-9c0f-ddbc81685942').success).toBe(
      false,
    );
  });

  it('accepts anything reasonable as an idOrSlug path value', () => {
    expect(categoryIdOrSlugSchema.safeParse('mess').success).toBe(true);
    expect(categoryIdOrSlugSchema.safeParse('01a0babd-b2d2-725f-9c0f-ddbc81685942').success).toBe(
      true,
    );
  });
});

describe('createCategoryRequestSchema', () => {
  const valid = { name: 'Mess' };

  it('needs only a name, and defaults sortOrder to 0', () => {
    expect(createCategoryRequestSchema.parse(valid)).toEqual({ name: 'Mess', sortOrder: 0 });
  });

  it('accepts a full group or a full leaf category', () => {
    const group = {
      name: 'Food',
      description: 'Everything to eat',
      icon: 'utensils',
      sortOrder: 2,
    };
    expect(createCategoryRequestSchema.safeParse(group).success).toBe(true);

    const leaf = {
      ...valid,
      parentId: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
      defaultPriceUnit: 'MONTH',
      slug: 'mess',
    };
    expect(createCategoryRequestSchema.safeParse(leaf).success).toBe(true);
  });

  it('rejects markup in the name and description', () => {
    expect(
      createCategoryRequestSchema.safeParse({ name: '<script>alert(1)</script>' }).success,
    ).toBe(false);
    expect(
      createCategoryRequestSchema.safeParse({ ...valid, description: '<b>x</b>' }).success,
    ).toBe(false);
  });

  it('rejects an invalid parentId, an unknown price unit and a negative sort order', () => {
    expect(
      createCategoryRequestSchema.safeParse({ ...valid, parentId: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(
      createCategoryRequestSchema.safeParse({ ...valid, defaultPriceUnit: 'FORTNIGHT' }).success,
    ).toBe(false);
    expect(createCategoryRequestSchema.safeParse({ ...valid, sortOrder: -1 }).success).toBe(false);
  });

  it('rejects unknown or staff-only fields (mass assignment)', () => {
    for (const field of ['status', 'id', 'createdAt', 'children', 'attributes']) {
      expect(createCategoryRequestSchema.safeParse({ ...valid, [field]: 'x' }).success).toBe(false);
    }
  });

  it('every price unit in the enum is accepted', () => {
    for (const unit of PRICE_UNITS) {
      expect(
        createCategoryRequestSchema.safeParse({ ...valid, defaultPriceUnit: unit }).success,
      ).toBe(true);
    }
  });
});

describe('updateCategoryRequestSchema', () => {
  it('changes only what is sent and rejects an empty body', () => {
    expect(updateCategoryRequestSchema.parse({ sortOrder: 3 })).toEqual({ sortOrder: 3 });
    expect(updateCategoryRequestSchema.safeParse({}).success).toBe(false);
  });

  it('clears optional text with null but not the name', () => {
    expect(updateCategoryRequestSchema.parse({ description: null, icon: null })).toEqual({
      description: null,
      icon: null,
    });
    expect(updateCategoryRequestSchema.safeParse({ name: null }).success).toBe(false);
  });

  it.each(['parentId', 'status'])('refuses %s: it is not editable here', (field) => {
    expect(updateCategoryRequestSchema.safeParse({ [field]: 'x' }).success).toBe(false);
  });
});

describe('categoryActionRequestSchema and amenityActionRequestSchema', () => {
  it('accept no body, an empty body, or a reason', () => {
    for (const schema of [categoryActionRequestSchema, amenityActionRequestSchema]) {
      expect(schema.safeParse(undefined).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.parse({ reason: '  Merged  ' })).toEqual({ reason: 'Merged' });
      expect(schema.safeParse({ reason: '<script>' }).success).toBe(false);
      expect(schema.safeParse({ notAField: 1 }).success).toBe(false);
    }
  });
});

describe('createCategoryAttributeRequestSchema', () => {
  const base = { key: 'seating_capacity', name: 'Seating capacity', dataType: 'INTEGER' } as const;

  it('accepts a simple non-choice attribute with defaults', () => {
    expect(createCategoryAttributeRequestSchema.parse(base)).toEqual({
      ...base,
      required: false,
      filterable: false,
      searchable: false,
      sortOrder: 0,
    });
  });

  it('lower-cases the key', () => {
    expect(
      createCategoryAttributeRequestSchema.parse({ ...base, key: 'Seating_Capacity' }).key,
    ).toBe('seating_capacity');
  });

  it('every data type in the enum is accepted with a fitting payload', () => {
    for (const dataType of ATTRIBUTE_DATA_TYPES) {
      const isChoice = dataType === 'ENUM' || dataType === 'MULTI_ENUM';
      const payload = {
        ...base,
        dataType,
        ...(isChoice ? { options: [{ value: 'a', label: 'A' }] } : {}),
      };
      expect(createCategoryAttributeRequestSchema.safeParse(payload).success, dataType).toBe(true);
    }
  });

  it('requires at least one option for ENUM and MULTI_ENUM', () => {
    for (const dataType of ['ENUM', 'MULTI_ENUM'] as const) {
      const missing = createCategoryAttributeRequestSchema.safeParse({ ...base, dataType });
      expect(missing.success).toBe(false);
      expect(messagesOf(missing)).toEqual(['options']);
      const empty = createCategoryAttributeRequestSchema.safeParse({
        ...base,
        dataType,
        options: [],
      });
      expect(empty.success).toBe(false);
    }
  });

  it('refuses options on a non-choice data type', () => {
    const result = createCategoryAttributeRequestSchema.safeParse({
      ...base,
      dataType: 'INTEGER',
      options: [{ value: 'a', label: 'A' }],
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toEqual(['options']);
  });

  it('refuses duplicate option values', () => {
    const result = createCategoryAttributeRequestSchema.safeParse({
      ...base,
      dataType: 'ENUM',
      options: [
        { value: 'veg', label: 'Veg' },
        { value: 'veg', label: 'Vegetarian' },
      ],
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toEqual(['options']);
  });

  it('bounds the number of options', () => {
    const options = Array.from({ length: MAX_ATTRIBUTE_OPTIONS + 1 }, (_, index) => ({
      value: `v${index}`,
      label: `V${index}`,
    }));
    expect(
      createCategoryAttributeRequestSchema.safeParse({ ...base, dataType: 'ENUM', options })
        .success,
    ).toBe(false);
  });

  it('rejects an invalid key and markup in the name or help text', () => {
    expect(createCategoryAttributeRequestSchema.safeParse({ ...base, key: '1abc' }).success).toBe(
      false,
    );
    expect(
      createCategoryAttributeRequestSchema.safeParse({ ...base, name: '<b>x</b>' }).success,
    ).toBe(false);
    expect(
      createCategoryAttributeRequestSchema.safeParse({ ...base, helpText: '<script>' }).success,
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      createCategoryAttributeRequestSchema.safeParse({ ...base, categoryId: 'x' }).success,
    ).toBe(false);
  });
});

describe('updateCategoryAttributeRequestSchema', () => {
  it('changes only what is sent and rejects an empty body', () => {
    expect(updateCategoryAttributeRequestSchema.parse({ required: true })).toEqual({
      required: true,
    });
    expect(updateCategoryAttributeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('refuses key and dataType: recreate the attribute instead', () => {
    expect(updateCategoryAttributeRequestSchema.safeParse({ key: 'new_key' }).success).toBe(false);
    expect(updateCategoryAttributeRequestSchema.safeParse({ dataType: 'TEXT' }).success).toBe(
      false,
    );
  });

  it('can clear unit and helpText, and clear options back to none', () => {
    expect(
      updateCategoryAttributeRequestSchema.parse({ unit: null, helpText: null, options: null }),
    ).toEqual({
      unit: null,
      helpText: null,
      options: null,
    });
  });

  it('still refuses duplicate option values (dataType-fit is re-checked by the service)', () => {
    const result = updateCategoryAttributeRequestSchema.safeParse({
      options: [
        { value: 'a', label: 'A' },
        { value: 'a', label: 'A again' },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('createCategoryRatingDimensionRequestSchema', () => {
  it('accepts a key and a label, defaulting sortOrder', () => {
    expect(
      createCategoryRatingDimensionRequestSchema.parse({
        key: 'Cleanliness',
        label: 'Cleanliness',
      }),
    ).toEqual({
      key: 'cleanliness',
      label: 'Cleanliness',
      sortOrder: 0,
    });
  });

  it('rejects an invalid key and markup in the label', () => {
    expect(
      createCategoryRatingDimensionRequestSchema.safeParse({ key: '1x', label: 'Cleanliness' })
        .success,
    ).toBe(false);
    expect(
      createCategoryRatingDimensionRequestSchema.safeParse({ key: 'x', label: '<b>x</b>' }).success,
    ).toBe(false);
  });
});

describe('updateCategoryRatingDimensionRequestSchema', () => {
  it('changes only label/sortOrder and refuses an empty body or the key', () => {
    expect(updateCategoryRatingDimensionRequestSchema.parse({ label: 'Value for money' })).toEqual({
      label: 'Value for money',
    });
    expect(updateCategoryRatingDimensionRequestSchema.safeParse({}).success).toBe(false);
    expect(updateCategoryRatingDimensionRequestSchema.safeParse({ key: 'x' }).success).toBe(false);
  });
});

describe('createAmenityRequestSchema', () => {
  it('accepts a key and a name, defaulting sortOrder', () => {
    expect(createAmenityRequestSchema.parse({ key: 'WiFi', name: 'WiFi' })).toEqual({
      key: 'wifi',
      name: 'WiFi',
      sortOrder: 0,
    });
  });

  it('rejects an invalid key and an unknown field', () => {
    expect(createAmenityRequestSchema.safeParse({ key: '1x', name: 'X' }).success).toBe(false);
    expect(
      createAmenityRequestSchema.safeParse({ key: 'x', name: 'X', status: 'ACTIVE' }).success,
    ).toBe(false);
  });
});

describe('updateAmenityRequestSchema', () => {
  it('changes only what is sent, refuses an empty body and refuses the key', () => {
    expect(updateAmenityRequestSchema.parse({ name: 'Wi-Fi' })).toEqual({ name: 'Wi-Fi' });
    expect(updateAmenityRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAmenityRequestSchema.safeParse({ key: 'x' }).success).toBe(false);
  });

  it('can clear the icon', () => {
    expect(updateAmenityRequestSchema.parse({ icon: null })).toEqual({ icon: null });
  });
});

describe('categoryOptionSchema', () => {
  it('requires a machine-key value and a plain-text label', () => {
    expect(categoryOptionSchema.safeParse({ value: 'veg', label: 'Veg' }).success).toBe(true);
    expect(categoryOptionSchema.safeParse({ value: 'Not A Key', label: 'X' }).success).toBe(false);
    expect(categoryOptionSchema.safeParse({ value: 'veg', label: '<b>Veg</b>' }).success).toBe(
      false,
    );
  });
});
