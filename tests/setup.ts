/**
 * Global test setup for Bun test runner.
 */

import { beforeAll, afterAll, mock } from 'bun:test';

// Mock external dependencies that require native modules
mock.module('better-sqlite3', () => ({}));
mock.module('sharp', () => ({}));

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global cleanup
});
