/**
 * Database factory for ScanSift.
 *
 * Uses bun:sqlite (built-in) with Drizzle ORM's bun-sqlite driver.
 * Migrations are applied automatically on every createDb() call.
 */

import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

export type { Batch, NewBatch, NewPair, NewPhoto, Pair, Photo } from './schema';
export { batches, pairs, photos } from './schema';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Create and return a Drizzle database instance.
 *
 * @param path  Filesystem path for the SQLite database file, or ':memory:' for
 *              an in-memory database (used in tests).
 */
export const createDb = (path: string) => {
  const client = new Database(path);
  // WAL mode for better concurrent read performance in production
  if (path !== ':memory:') {
    client.exec('PRAGMA journal_mode=WAL;');
  }
  const db = drizzle(client, { schema });
  migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
  return db;
};

export type Db = ReturnType<typeof createDb>;
