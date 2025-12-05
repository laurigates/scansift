/**
 * Global test setup for Vitest.
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Mock external dependencies that require native modules
vi.mock('better-sqlite3');
vi.mock('sharp');

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global cleanup
});
