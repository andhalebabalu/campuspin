import type { StandardSchemaConverter } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Lets Swagger describe routes from their zod schemas, so request validation and API
 * documentation come from one definition and cannot drift apart.
 */
export const zodStandardSchemaConverter: StandardSchemaConverter = (schema, { schemaType }) => ({
  schema: z.toJSONSchema(schema as z.ZodType, {
    io: schemaType,
    target: 'openapi-3.0',
    unrepresentable: 'any',
    override: ({ jsonSchema }) => {
      // zod adds the safe-integer bounds to every `.int()`; they are noise in API docs.
      if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
      if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;
    },
  }),
});
