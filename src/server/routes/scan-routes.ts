/**
 * Scan API Routes
 *
 * Provides REST API endpoints for scanning operations:
 * - Scanner discovery and status
 * - Front/back scanning
 * - Batch completion and reset
 */

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { GridPosition, ScanOptions } from '@/shared/types';
import { ScanOrchestrator } from '../services/scan-orchestrator';
import { discoverScanners, getScannerStatus } from '../services/scanner';

/**
 * Request body for scan endpoints
 */
interface ScanRequestBody {
  resolution?: 300 | 600;
}

/**
 * Augment Fastify instance with scan orchestrator
 */
declare module 'fastify' {
  interface FastifyInstance {
    scanOrchestrator?: ScanOrchestrator;
  }
}

/**
 * Register scan routes
 */
export const registerScanRoutes = async (app: FastifyInstance) => {
  // Initialize scan orchestrator singleton
  if (!app.scanOrchestrator) {
    app.scanOrchestrator = new ScanOrchestrator({
      scanTimeout: 120000, // 2 minutes
      outputDirectory: './scanned-photos',
    });
  }

  const orchestrator = app.scanOrchestrator;

  /**
   * GET /api/scanner/discover
   * Discover scanners on the local network
   */
  app.get('/api/scanner/discover', async (request, reply) => {
    try {
      request.log.info('Starting scanner discovery');
      const scanners = await discoverScanners(10000); // 10 second timeout

      if (scanners.length === 0) {
        return reply.status(404).send({
          error: 'No scanners found',
          message: 'No eSCL-compatible scanners discovered on the network',
        });
      }

      return {
        scanners: scanners.map((scanner) => ({
          name: scanner.name,
          host: scanner.host,
          port: scanner.port,
          addresses: scanner.addresses,
          model: scanner.txt?.ty || scanner.txt?.MakeAndModel,
        })),
        count: scanners.length,
      };
    } catch (error) {
      request.log.error(error, 'Scanner discovery failed');
      return reply.status(500).send({
        error: 'Discovery failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/scanner/status
   * Get scanner status and availability
   */
  app.get('/api/scanner/status', async (request, reply) => {
    try {
      // Quick scanner discovery check
      const available = await orchestrator.isScannerReady();

      if (!available) {
        return {
          available: false,
          message: 'No scanner available',
        };
      }

      // Try to get detailed status from first discovered scanner
      const scanners = await discoverScanners(5000);
      if (scanners.length === 0) {
        return {
          available: false,
          message: 'Scanner no longer available',
        };
      }

      const scanner = scanners[0];
      if (!scanner) {
        return {
          available: false,
          message: 'Scanner no longer available',
        };
      }

      const status = await getScannerStatus(scanner);

      return {
        available: true,
        scanner: {
          name: scanner.name,
          host: scanner.host,
          port: scanner.port,
          model: scanner.txt?.ty || scanner.txt?.MakeAndModel,
        },
        state: status?.state || 'Unknown',
        adfState: status?.adfState,
      };
    } catch (error) {
      request.log.error(error, 'Failed to get scanner status');
      return reply.status(500).send({
        error: 'Status check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/scan/front
   * Start a front scan operation
   */
  app.post<{ Body: ScanRequestBody }>('/api/scan/front', async (request, reply) => {
    try {
      const { resolution } = request.body;

      // Validate resolution if provided
      if (resolution && resolution !== 300 && resolution !== 600) {
        return reply.status(400).send({
          error: 'Invalid resolution',
          message: 'Resolution must be 300 or 600 DPI',
        });
      }

      const options: ScanOptions | undefined = resolution
        ? { resolution, colorMode: 'RGB24', format: 'image/jpeg' }
        : undefined;

      request.log.info({ options }, 'Starting front scan');
      const result = await orchestrator.startFrontScan(options);

      return {
        success: true,
        scanId: result.scanId,
        photosDetected: result.photosDetected,
        rawImagePath: result.rawImagePath,
        timestamp: result.timestamp,
      };
    } catch (error) {
      request.log.error(error, 'Front scan failed');

      // Determine appropriate status code based on error
      let statusCode = 500;
      if (error instanceof Error) {
        if (error.message.includes('Cannot start') || error.message.includes('state')) {
          statusCode = 409; // Conflict - wrong state
        } else if (error.message.includes('No scanner') || error.message.includes('not found')) {
          statusCode = 404; // Scanner not found
        } else if (error.message.includes('No photos detected')) {
          statusCode = 422; // Unprocessable - scan succeeded but no photos found
        }
      }

      return reply.status(statusCode).send({
        error: 'Front scan failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/scan/back
   * Start a back scan operation (must be called after front scan)
   */
  app.post<{ Body: ScanRequestBody }>('/api/scan/back', async (request, reply) => {
    try {
      const { resolution } = request.body;

      // Validate resolution if provided
      if (resolution && resolution !== 300 && resolution !== 600) {
        return reply.status(400).send({
          error: 'Invalid resolution',
          message: 'Resolution must be 300 or 600 DPI',
        });
      }

      const options: ScanOptions | undefined = resolution
        ? { resolution, colorMode: 'RGB24', format: 'image/jpeg' }
        : undefined;

      request.log.info({ options }, 'Starting back scan');
      const result = await orchestrator.startBackScan(options);

      return {
        success: true,
        scanId: result.scanId,
        photosDetected: result.photosDetected,
        rawImagePath: result.rawImagePath,
        timestamp: result.timestamp,
      };
    } catch (error) {
      request.log.error(error, 'Back scan failed');

      // Determine appropriate status code
      let statusCode = 500;
      if (error instanceof Error) {
        if (
          error.message.includes('Cannot start') ||
          error.message.includes('Must complete front scan')
        ) {
          statusCode = 409; // Conflict - must do front scan first
        } else if (error.message.includes('No scanner') || error.message.includes('not found')) {
          statusCode = 404;
        } else if (error.message.includes('No photos detected')) {
          statusCode = 422;
        }
      }

      return reply.status(statusCode).send({
        error: 'Back scan failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/scan/complete
   * Complete the current batch (pair and save photos)
   */
  app.post('/api/scan/complete', async (request, reply) => {
    try {
      request.log.info('Completing batch');
      const result = await orchestrator.completeBatch();

      return {
        success: true,
        batchId: result.batchId,
        pairsSaved: result.pairsSaved,
        totalPhotos: result.totalPhotos,
        outputDirectory: result.outputDirectory,
        timestamp: result.timestamp,
      };
    } catch (error) {
      request.log.error(error, 'Batch completion failed');

      let statusCode = 500;
      if (error instanceof Error) {
        if (error.message.includes('No front scan')) {
          statusCode = 409; // Conflict - no scan to complete
        }
      }

      return reply.status(statusCode).send({
        error: 'Batch completion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/scan/reset
   * Reset the scan orchestrator to idle state
   */
  app.post('/api/scan/reset', async (request, reply) => {
    try {
      request.log.info('Resetting scan state');
      orchestrator.reset();

      return {
        success: true,
        message: 'Scan state reset to idle',
        state: orchestrator.getState(),
      };
    } catch (error) {
      request.log.error(error, 'Reset failed');
      return reply.status(500).send({
        error: 'Reset failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/scan/state
   * Get current scan state
   */
  app.get('/api/scan/state', async (request, reply) => {
    try {
      const state = orchestrator.getState();
      return {
        state,
      };
    } catch (error) {
      request.log.error(error, 'Failed to get state');
      return reply.status(500).send({
        error: 'Failed to get state',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/scan/previews
   * Get all detected photo previews as thumbnails
   */
  app.get('/api/scan/previews', async (request, reply) => {
    try {
      const frontScanResult = orchestrator.frontScanResult;

      // Return empty array if no scan has been done yet
      if (!frontScanResult || !frontScanResult.detectedPhotos) {
        return { previews: [] };
      }

      // Generate thumbnails for all detected photos
      const previews = await Promise.all(
        frontScanResult.detectedPhotos.map(async (photo) => {
          // Resize to max 400px maintaining aspect ratio
          const thumbnail = await sharp(photo.image)
            .resize(400, 400, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85 })
            .toBuffer();

          return {
            position: photo.position,
            thumbnail: thumbnail.toString('base64'),
            bounds: photo.bounds,
            confidence: photo.confidence,
          };
        }),
      );

      return { previews };
    } catch (error) {
      request.log.error(error, 'Failed to get previews');
      return reply.status(500).send({
        error: 'Failed to get previews',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/scan/preview/:position
   * Get full resolution preview for a specific photo position
   */
  app.get<{ Params: { position: string } }>(
    '/api/scan/preview/:position',
    async (request, reply) => {
      try {
        const { position } = request.params;

        // Validate position parameter
        const validPositions: GridPosition[] = [
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
        ];
        if (!validPositions.includes(position as GridPosition)) {
          return reply.status(400).send({
            error: 'Invalid position',
            message: `Position must be one of: ${validPositions.join(', ')}`,
          });
        }

        const frontScanResult = orchestrator.frontScanResult;

        // Check if scan has been done
        if (!frontScanResult || !frontScanResult.detectedPhotos) {
          return reply.status(404).send({
            error: 'No scan results',
            message: 'No photos have been scanned yet',
          });
        }

        // Find photo at requested position
        const photo = frontScanResult.detectedPhotos.find((p) => p.position === position);

        if (!photo) {
          return reply.status(404).send({
            error: 'Photo not found',
            message: `No photo found at position: ${position}`,
          });
        }

        // Return full resolution image as base64
        return {
          position: photo.position,
          image: photo.image.toString('base64'),
          bounds: photo.bounds,
          confidence: photo.confidence,
        };
      } catch (error) {
        request.log.error(error, 'Failed to get preview');
        return reply.status(500).send({
          error: 'Failed to get preview',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
};
