import { authUserSchema, profileSchema, uploadedImageSchema } from '@platform/contracts';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Setting, showing and removing a profile photo, against the real database. */
describe('Profile photo (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let member: Persona;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    member = await persona(ctx, 'photo-member');
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('sets a photo uploaded here and shows it on the account', async () => {
    const upload = await as(member, ctx.post(`${API}/uploads/images`))
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);
    const url = successOf(uploadedImageSchema, upload).data.url;

    const profile = await as(member, ctx.patch(`${API}/me/profile`))
      .send({ avatarUrl: url })
      .expect(200);
    expect(successOf(profileSchema, profile).data.avatarUrl).toBe(url);

    const me = await as(member, ctx.get(`${API}/auth/me`)).expect(200);
    expect(successOf(authUserSchema, me).data.avatarUrl).toBe(url);
  });

  it('refuses a photo from anywhere else', async () => {
    const response = await as(member, ctx.patch(`${API}/me/profile`)).send({
      avatarUrl: 'https://tracker.example.com/me.png',
    });
    expect(response.status).toBe(400);
    expect(errorOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('removes the photo with null', async () => {
    const profile = await as(member, ctx.patch(`${API}/me/profile`))
      .send({ avatarUrl: null })
      .expect(200);
    expect(successOf(profileSchema, profile).data.avatarUrl).toBeNull();
  });
});
