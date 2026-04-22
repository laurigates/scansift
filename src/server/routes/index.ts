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
  // Register scan routes
  await registerScanRoutes(app);
};
