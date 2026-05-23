/**
 * Tests for the /api/stats Drizzle query logic.
 *
 * Exercises the count + join queries against a real in-memory db rather
 * than booting the full Fastify app. The handler in src/server/index.ts
 * runs the same queries verbatim.
 */

import { describe, expect, test } from 'bun:test';
import { count, eq, gte } from 'drizzle-orm';
import { batches, createDb, photos } from '../../src/server/db';

function statsQuery(db: ReturnType<typeof createDb>, sessionStartIso: string) {
  const [totalRow] = db.select({ value: count() }).from(photos).all();
  const [sessionRow] = db
    .select({ value: count() })
    .from(photos)
    .innerJoin(batches, eq(photos.batchId, batches.id))
    .where(gte(batches.startedAt, sessionStartIso))
    .all();
  return {
    totalPhotos: totalRow?.value ?? 0,
    sessionPhotos: sessionRow?.value ?? 0,
  };
}

describe('/api/stats query logic', () => {
  test('returns zero counts on an empty database', () => {
    const db = createDb(':memory:');
    const result = statsQuery(db, new Date().toISOString());

    expect(result.totalPhotos).toBe(0);
    expect(result.sessionPhotos).toBe(0);
  });

  test('totalPhotos counts every photo regardless of batch.started_at', () => {
    const db = createDb(':memory:');
    db.insert(batches)
      .values({
        id: 'batch-001',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'complete',
        outputDirectory: '/tmp/scans/batch-001',
      })
      .run();
    db.insert(photos)
      .values([
        {
          batchId: 'batch-001',
          frontFilePath: '/tmp/scans/batch-001/1.jpg',
          originalFrontPath: '/tmp/scans/batch-001/raw/1.jpg',
          scanDate: '2026-01-01T00:00:00.000Z',
        },
        {
          batchId: 'batch-001',
          frontFilePath: '/tmp/scans/batch-001/2.jpg',
          originalFrontPath: '/tmp/scans/batch-001/raw/2.jpg',
          scanDate: '2026-01-01T00:00:00.000Z',
        },
      ])
      .run();

    const result = statsQuery(db, new Date().toISOString());
    expect(result.totalPhotos).toBe(2);
  });

  test('sessionPhotos excludes batches started before sessionStart', () => {
    const db = createDb(':memory:');
    const sessionStartIso = '2026-05-01T00:00:00.000Z';

    // Pre-session batch
    db.insert(batches)
      .values({
        id: 'past-batch',
        startedAt: '2026-04-30T00:00:00.000Z',
        status: 'complete',
        outputDirectory: '/tmp/past',
      })
      .run();
    db.insert(photos)
      .values({
        batchId: 'past-batch',
        frontFilePath: '/tmp/past/1.jpg',
        originalFrontPath: '/tmp/past/raw/1.jpg',
        scanDate: '2026-04-30T00:00:00.000Z',
      })
      .run();

    // In-session batch
    db.insert(batches)
      .values({
        id: 'live-batch',
        startedAt: '2026-05-23T10:00:00.000Z',
        status: 'complete',
        outputDirectory: '/tmp/live',
      })
      .run();
    db.insert(photos)
      .values([
        {
          batchId: 'live-batch',
          frontFilePath: '/tmp/live/1.jpg',
          originalFrontPath: '/tmp/live/raw/1.jpg',
          scanDate: '2026-05-23T10:00:00.000Z',
        },
        {
          batchId: 'live-batch',
          frontFilePath: '/tmp/live/2.jpg',
          originalFrontPath: '/tmp/live/raw/2.jpg',
          scanDate: '2026-05-23T10:00:00.000Z',
        },
      ])
      .run();

    const result = statsQuery(db, sessionStartIso);
    expect(result.totalPhotos).toBe(3);
    expect(result.sessionPhotos).toBe(2);
  });
});
