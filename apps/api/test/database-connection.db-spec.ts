import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiSuccessSchema, databaseHealthSchema } from '@platform/contracts';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';
import { createDb } from './support/db.js';

/**
 * Every table the migrations must create: the 32 of `initial_schema` plus the 3 authentication token
 * tables of `auth_tokens` (Phase 3). Kept exact on purpose, so an unplanned table fails this test.
 */
const EXPECTED_TABLES = [
  'refresh_tokens',
  'email_verification_tokens',
  'leads',
  'password_reset_tokens',
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'colleges',
  'college_images',
  'college_places',
  'categories',
  'category_attributes',
  'category_rating_dimensions',
  'amenities',
  'places',
  'place_categories',
  'place_images',
  'place_amenities',
  'place_hours',
  'place_attribute_values',
  'place_price_options',
  'business_profiles',
  'business_members',
  'place_claims',
  'place_submissions',
  'place_submission_images',
  'place_contributions',
  'reviews',
  'review_ratings',
  'review_reports',
  'saved_places',
  'reports',
  'notifications',
  'audit_logs',
  'college_email_domains',
  'student_verifications',
  'user_settings',
  'community_posts',
  'community_comments',
  'community_reactions',
  'user_blocks',
];

describe('Real MySQL database: connection and migration', () => {
  const db = createDb();

  afterAll(async () => {
    await db.$disconnect();
  });

  it('connects to the link_platform database and reports the server version', async () => {
    const [row] = await db.$queryRaw<Array<{ version: string; db: string }>>`
      SELECT VERSION() AS version, DATABASE() AS db`;

    expect(row?.db).toMatch(/^link_platform/);
    expect(row?.version).toMatch(/^\d+\.\d+/);
  });

  it('has applied the initial_schema migration successfully', async () => {
    const rows = await db.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;

    const initial = rows.find((row) => row.migration_name.endsWith('_initial_schema'));
    expect(initial).toBeDefined();
    expect(initial?.finished_at).not.toBeNull();
    expect(initial?.rolled_back_at).toBeNull();
  });

  it('has applied the auth_tokens migration successfully (Phase 3)', async () => {
    const rows = await db.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;

    const auth = rows.find((row) => row.migration_name.endsWith('_auth_tokens'));
    expect(auth).toBeDefined();
    expect(auth?.finished_at).not.toBeNull();
    expect(auth?.rolled_back_at).toBeNull();
    // Applied after the initial schema, never before it.
    const names = rows.map((row) => row.migration_name).sort();
    expect(names.findIndex((name) => name.endsWith('_initial_schema'))).toBeLessThan(
      names.findIndex((name) => name.endsWith('_auth_tokens')),
    );
  });

  it('has every expected table (and nothing unexpected)', async () => {
    const rows = await db.$queryRaw<Array<{ name: string }>>`
      SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;

    const actual = rows.map((row) => row.name).filter((name) => name !== '_prisma_migrations');
    expect(actual.sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it('has the hand-written CHECK constraints from the migration', async () => {
    const [row] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM information_schema.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME LIKE 'chk\_%'`;

    expect(Number(row?.n)).toBe(29);
  });

  it('uses utf8mb4 so Marathi/Devanagari names can be stored', async () => {
    const [row] = await db.$queryRaw<Array<{ charset: string }>>`
      SELECT DEFAULT_CHARACTER_SET_NAME AS charset FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME = DATABASE()`;
    expect(row?.charset).toBe('utf8mb4');
  });
});

describe('Health API against the real database', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports the database as connected', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok', database: 'connected' },
      message: 'API is running',
    });
  });

  it('GET /api/v1/health/database returns the database name and server version', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/database').expect(200);

    // The response must satisfy the shared contract (the same schema the web app uses).
    const body = apiSuccessSchema(databaseHealthSchema).parse(response.body);
    expect(body.data.status).toBe('ok');
    expect(body.data.database).toMatch(/^link_platform/);
    expect(body.data.serverVersion).toMatch(/^\d+\.\d+/);
  });
});
