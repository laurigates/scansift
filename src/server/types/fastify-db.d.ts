/**
 * Type augmentation for Fastify instance — database decoration.
 *
 * Extends FastifyInstance with the Drizzle db instance attached via
 * app.decorate('db', ...) in src/server/index.ts.
 */

import 'fastify';
import type { Db } from '../db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}
