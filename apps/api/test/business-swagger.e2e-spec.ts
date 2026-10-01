import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

interface Operation {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    content: Record<
      string,
      { schema: { properties?: Record<string, unknown>; additionalProperties?: boolean } }
    >;
  };
  responses: Record<
    string,
    { content?: Record<string, { schema: { example?: { success?: boolean; message?: string } } }> }
  >;
}
interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
}

/** `BUSINESS_OWNER` only: 401 and 403 documented. [method, path, JSON body?, success status] */
const BUSINESS = [
  ['get', '/api/v1/business/dashboard', false, '200'],
  ['patch', '/api/v1/business/profile', true, '200'],
  ['get', '/api/v1/business/listings', false, '200'],
  ['post', '/api/v1/business/listings', true, '201'],
  ['get', '/api/v1/business/enquiries', false, '200'],
  ['patch', '/api/v1/business/enquiries/{id}', true, '200'],
  ['get', '/api/v1/business/reviews', false, '200'],
  ['get', '/api/v1/business/analytics', false, '200'],
  ['get', '/api/v1/business/subscription', false, '200'],
] as const;

describe('Swagger documentation of business owners, enquiries and uploads (e2e)', () => {
  let app: NestExpressApplication;
  let doc: OpenApiDocument;
  const operation = (path: string, method: string) => doc.paths[path]?.[method];

  beforeAll(async () => {
    app = await createTestApp();
    doc = (await request(app.getHttpServer()).get('/api/docs-json').expect(200))
      .body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  const SERVICE_SEGMENTS = [
    'places',
    'orders',
    'insights',
    'qr',
    'requests',
    'offers',
    'redemptions',
    'bookings',
    // Capabilities, invoices, the dashboard summary and the table board (capability-based dashboard).
    'capabilities',
    'invoices',
    'summary',
    'tables',
  ];

  it('documents exactly the 9 business routes', () => {
    const documented = Object.entries(doc.paths)
      // Services, orders, QR codes and insights under /business belong to the daily-use services
      // feature (tagged "Business: Services" / "Business: Orders").
      .filter(
        ([path]) =>
          path.startsWith('/api/v1/business/') &&
          !SERVICE_SEGMENTS.some((segment) => path.startsWith(`/api/v1/business/${segment}`)),
      )
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method} ${path}`),
      );
    expect(documented.sort()).toEqual(BUSINESS.map(([m, p]) => `${m} ${p}`).sort());
  });

  it.each(BUSINESS)(
    '%s %s: Bearer security, a success example and 401/403',
    (method, path, hasBody, success) => {
      const op = operation(path, method);
      expect(op?.tags?.[0]).toBe('Business');
      expect(op?.summary).toBeTruthy();
      expect(op?.security).toEqual([{ bearer: [] }]);
      const schema = op?.requestBody?.content['application/json']?.schema;
      if (hasBody) expect(schema?.properties).toBeDefined();
      else expect(schema).toBeUndefined();

      const ok = op?.responses[success]?.content?.['application/json']?.schema.example;
      expect(ok).toMatchObject({ success: true });
      expect(op?.responses).toHaveProperty('401');
      expect(op?.responses).toHaveProperty('403');
    },
  );

  it('documents sending an enquiry: strict body with consent, 403, 404 and 409', () => {
    const op = operation('/api/v1/places/{idOrSlug}/enquiries', 'post');
    expect(op?.tags?.[0]).toBe('Enquiries');
    expect(op?.security).toEqual([{ bearer: [] }]);
    const schema = op?.requestBody?.content['application/json']?.schema;
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
      'consent',
      'contactPhone',
      'message',
    ]);
    expect(schema?.additionalProperties).toBe(false);
    for (const status of ['201', '401', '403', '404', '409', '429']) {
      expect(op?.responses).toHaveProperty(status);
    }
  });

  it('documents the image upload as multipart with its 413 and 415', () => {
    const op = operation('/api/v1/uploads/images', 'post');
    expect(op?.tags?.[0]).toBe('Uploads');
    expect(op?.security).toEqual([{ bearer: [] }]);
    expect(op?.requestBody?.content).toHaveProperty('multipart/form-data');
    for (const status of ['201', '400', '401', '413', '415', '429']) {
      expect(op?.responses).toHaveProperty(status);
    }
  });
});
