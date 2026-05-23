/**
 * Global test setup for Bun test runner.
 */

import { afterAll, beforeAll } from 'bun:test';
import { createDb } from '../src/server/db';

// In-memory database for tests — migrations run automatically inside createDb
export let testDb: ReturnType<typeof createDb>;

beforeAll(async () => {
  testDb = createDb(':memory:');
});

afterAll(async () => {
  // Global cleanup
});
