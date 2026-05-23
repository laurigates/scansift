/**
 * Smoke test for the Drizzle SQLite schema.
 *
 * Verifies that a freshly bootstrapped in-memory database accepts the
 * canonical insert path (batch → photo → pair) and that select returns
 * the data we just wrote. If this test passes, migrations are running
 * correctly and the FK chain is wired up.
 */

import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { batches, createDb, pairs, photos } from '../../src/server/db';

describe('db schema smoke test', () => {
  test('inserts and selects a batch → photo → pair chain', () => {
    const db = createDb(':memory:');

    db.insert(batches)
      .values({
        id: 'batch-001',
        startedAt: '2026-05-23T10:00:00.000Z',
        status: 'complete',
        outputDirectory: '/tmp/scans/batch-001',
      })
      .run();

    const insertedPhoto = db
      .insert(photos)
      .values({
        batchId: 'batch-001',
        frontFilePath: '/tmp/scans/batch-001/front-1.jpg',
        originalFrontPath: '/tmp/scans/batch-001/raw/front-1.jpg',
        scanDate: '2026-05-23T10:00:00.000Z',
        gridPosition: 'top-left',
        confidenceScore: 0.85,
      })
      .returning()
      .all()[0];

    expect(insertedPhoto).toBeDefined();
    if (!insertedPhoto) return;

    db.insert(pairs)
      .values({
        batchId: 'batch-001',
        frontPhotoId: insertedPhoto.id,
      })
      .run();

    const batchRows = db.select().from(batches).where(eq(batches.id, 'batch-001')).all();
    const photoRows = db.select().from(photos).where(eq(photos.batchId, 'batch-001')).all();
    const pairRows = db.select().from(pairs).where(eq(pairs.batchId, 'batch-001')).all();

    expect(batchRows).toHaveLength(1);
    expect(batchRows[0]?.status).toBe('complete');
    expect(photoRows).toHaveLength(1);
    expect(photoRows[0]?.gridPosition).toBe('top-left');
    expect(photoRows[0]?.confidenceScore).toBe(0.85);
    expect(pairRows).toHaveLength(1);
    expect(pairRows[0]?.frontPhotoId).toBe(insertedPhoto.id);
    expect(pairRows[0]?.backPhotoId).toBeNull();
  });

  test('createDb(:memory:) returns a working Drizzle instance with migrations applied', () => {
    const db = createDb(':memory:');

    // If migrations didn't run, this select would throw with "no such table"
    const rows = db.select().from(batches).all();
    expect(rows).toEqual([]);
  });
});
