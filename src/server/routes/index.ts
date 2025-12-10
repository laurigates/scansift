/**
 * Routes Module Exports
 *
 * Central registry for all API routes.
 */

import type { FastifyInstance } from 'fastify';
import { registerScanRoutes } from './scan-routes';

/**
 * Register all application routes
 */
export const registerRoutes = async (app: FastifyInstance) => {
  // Health check endpoint for container orchestration
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register scan routes
  await registerScanRoutes(app);
};
