import { placeCardSchema, savedPlaceIdsSchema, savedPlaceStateSchema } from '@platform/contracts';
import { z } from 'zod';
import { type AuthTestContext, createAuthTestContext, successOf } from './support/auth-e2e.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';

/** Bookmarking places, against the real database (uses any live place; saves are undone). */
describe('Saved places (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let member: Persona;
  let placeId: string;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    member = await persona(ctx, 'saved-member');
    const place = await ctx.db.place.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    placeId = place.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('saves, lists and removes a place; saving twice is harmless', async () => {
    const saved = await as(member, ctx.put(`${API}/me/saved-places/${placeId}`)).expect(200);
    expect(successOf(savedPlaceStateSchema, saved).data).toEqual({ placeId, saved: true });
    await as(member, ctx.put(`${API}/me/saved-places/${placeId}`)).expect(200);

    const ids = successOf(
      savedPlaceIdsSchema,
      await as(member, ctx.get(`${API}/me/saved-places/ids`)).expect(200),
    );
    expect(ids.data).toEqual([placeId]);
    const list = successOf(
      z.array(placeCardSchema),
      await as(member, ctx.get(`${API}/me/saved-places`)).expect(200),
    );
    expect(list.data.map((place) => place.id)).toEqual([placeId]);

    await as(member, ctx.delete(`${API}/me/saved-places/${placeId}`)).expect(200);
    const after = successOf(
      savedPlaceIdsSchema,
      await as(member, ctx.get(`${API}/me/saved-places/ids`)).expect(200),
    );
    expect(after.data).toEqual([]);
  });

  it('needs a session and a live place', async () => {
    expect((await ctx.put(`${API}/me/saved-places/${placeId}`)).status).toBe(401);
    expect((await as(member, ctx.put(`${API}/me/saved-places/no-such-place-here`))).status).toBe(
      404,
    );
  });
});
