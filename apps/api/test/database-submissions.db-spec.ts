import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createDb, inRollback, makeCategory, makePlace, makeUser } from './support/db.js';

const P2003 = { code: 'P2003' }; // foreign key constraint

function makeSubmission(
  tx: Parameters<typeof makeUser>[0],
  submittedById: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  return tx.placeSubmission.create({
    data: {
      name: 'Test Submission',
      categoryId,
      address: 'Test address',
      latitude: 19.097,
      longitude: 74.749,
      submittedById,
      ...overrides,
    },
  });
}

describe('Real MySQL database: place submissions', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('referential integrity', () => {
    it('restricts deleting the submitter while their submission exists', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const category = await makeCategory(tx);
          await makeSubmission(tx, user.id, category.id);
          await tx.user.delete({ where: { id: user.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it('restricts deleting a category still referenced by a submission', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const category = await makeCategory(tx);
          await makeSubmission(tx, user.id, category.id);
          await tx.category.delete({ where: { id: category.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it('nulls resultingPlaceId when the place it created is deleted (the submission itself survives)', async () => {
      await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        const category = await makeCategory(tx);
        const place = await makePlace(tx, user.id, { status: 'PENDING' });
        const submission = await makeSubmission(tx, user.id, category.id, {
          resultingPlaceId: place.id,
        });

        await tx.place.delete({ where: { id: place.id } });

        const reloaded = await tx.placeSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        expect(reloaded.resultingPlaceId).toBeNull();
      });
    });

    it('nulls reviewedById when the reviewing staff member is deleted', async () => {
      await inRollback(db, async (tx) => {
        const submitter = await makeUser(tx);
        const reviewer = await makeUser(tx);
        const category = await makeCategory(tx);
        const submission = await makeSubmission(tx, submitter.id, category.id, {
          status: 'APPROVED',
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
        });

        await tx.user.delete({ where: { id: reviewer.id } });

        const reloaded = await tx.placeSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        expect(reloaded.reviewedById).toBeNull();
      });
    });

    it('cascades deleting a submission to its images', async () => {
      await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        const category = await makeCategory(tx);
        const submission = await makeSubmission(tx, user.id, category.id);
        await tx.placeSubmissionImage.create({
          data: { submissionId: submission.id, imageUrl: 'https://example.com/a.jpg' },
        });

        await tx.placeSubmission.delete({ where: { id: submission.id } });

        expect(await tx.placeSubmissionImage.count({ where: { submissionId: submission.id } })).toBe(
          0,
        );
      });
    });
  });

  describe('duplicateCandidates is a free-form JSON column', () => {
    it('stores and reads back an array of scored candidates', async () => {
      await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        const category = await makeCategory(tx);
        const candidates = [
          {
            placeId: 'p1',
            name: 'Existing Place',
            slug: 'existing-place',
            distanceMeters: 40,
            score: 0.91,
            level: 'block',
            reasons: ['Similar name', '40 m away'],
          },
        ];
        const submission = await makeSubmission(tx, user.id, category.id, {
          duplicateCandidates: candidates,
        });

        const reloaded = await tx.placeSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        expect(reloaded.duplicateCandidates).toEqual(candidates);
      });
    });
  });
});
