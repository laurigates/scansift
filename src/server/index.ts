/**
 * PhotoScan Server Entry Point
 *
 * Starts the Fastify server with:
 * - REST API endpoints for scanning operations
 * - WebSocket server for real-time updates
 * - Static file serving for the client app
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { SERVER, TIMEOUTS } from '@shared/constants';
import { count, eq, gte } from 'drizzle-orm';
import Fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';
import { batches, createDb, photos } from './db';
import { logger } from './logger';
import { registerRoutes } from './routes';
import { createScanOrchestrator } from './services/scan-orchestrator';
import { initializeSocketHandler } from './websocket/socket-handler';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createApp = async () => {
  const app = Fastify({
    logger: true,
  });

  // Server-process start time defines the "session" boundary for /api/stats —
  // photos from batches started after this point count as session photos.
  const sessionStartTime = new Date();

  // Register Socket.IO support
  await app.register(fastifySocketIO, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Register static file serving (client build)
  await app.register(fastifyStatic, {
    root: join(__dirname, '../../dist/client'),
    prefix: '/',
  });

  // Create scan orchestrator instance and attach to app
  const orchestrator = createScanOrchestrator({
    outputDirectory: process.env.OUTPUT_DIR ?? './scanned-photos',
    scanTimeout: TIMEOUTS.SCAN_TIMEOUT_MS,
  });
  app.decorate('scanOrchestrator', orchestrator);

  // Create SQLite database and attach to app
  const db = createDb(process.env.DB_PATH ?? './scansift.db');
  app.decorate('db', db);

  // Initialize Socket.IO handler with orchestrator
  app.ready((err) => {
    if (err) throw err;
    initializeSocketHandler(app.io, orchestrator);
  });

  // Health check endpoint
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Session stats endpoint — counts come from the photos table directly.
  // Session photos are scoped to batches started after the server boot time.
  app.get('/api/stats', async () => {
    const [totalRow] = app.db.select({ value: count() }).from(photos).all();
    const sessionStartIso = sessionStartTime.toISOString();
    const [sessionRow] = app.db
      .select({ value: count() })
      .from(photos)
      .innerJoin(batches, eq(photos.batchId, batches.id))
      .where(gte(batches.startedAt, sessionStartIso))
      .all();

    return {
      totalPhotos: totalRow?.value ?? 0,
      sessionPhotos: sessionRow?.value ?? 0,
      sessionStartTime: sessionStartIso,
    };
  });

  // Register all API routes (includes scan routes)
  await registerRoutes(app);

  return app;
};

const start = async () => {
  const app = await createApp();

  try {
    const port = Number(process.env.PORT) || SERVER.API_PORT;
    await app.listen({ port, host: '0.0.0.0' });
    logger.info(`PhotoScan server running on http://localhost:${port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

// Only auto-start when this file is executed directly (not imported by tests)
if (import.meta.main) {
  start();
}
