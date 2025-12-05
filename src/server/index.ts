/**
 * PhotoScan Server Entry Point
 *
 * Starts the Fastify server with:
 * - REST API endpoints for scanning operations
 * - WebSocket server for real-time updates
 * - Static file serving for the client app
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { SERVER } from '@shared/constants';

const __dirname = dirname(fileURLToPath(import.meta.url));

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const createApp = async () => {
  const app = Fastify({
    logger: true,
  });

  // Register WebSocket support
  await app.register(fastifyWebsocket);

  // Register static file serving (client build)
  await app.register(fastifyStatic, {
    root: join(__dirname, '../../dist/client'),
    prefix: '/',
  });

  // Health check endpoint
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Scanner status endpoint (placeholder)
  app.get('/api/scanner/status', async () => {
    // TODO: Implement actual scanner discovery
    return {
      available: false,
      message: 'Scanner discovery not yet implemented',
    };
  });

  // Session stats endpoint (placeholder)
  app.get('/api/stats', async () => {
    // TODO: Implement actual stats from database
    return {
      totalPhotos: 0,
      sessionPhotos: 0,
      sessionStartTime: new Date().toISOString(),
    };
  });

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

start();
