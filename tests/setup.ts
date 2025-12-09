/**
 * Global test setup for Bun test runner.
 */

import { afterAll, beforeAll, mock } from 'bun:test';

// Mock external dependencies that require native modules
// Note: sharp is NOT mocked because we need it for image processing tests
mock.module('better-sqlite3', () => ({}));

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global cleanup
});
