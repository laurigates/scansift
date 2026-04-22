/**
 * Socket.IO Handler
 *
 * Manages Socket.IO connections and integrates with the ScanOrchestrator.
 * Handles bidirectional communication between server and client:
 * - Server events: scan:progress, scan:complete, scan:error, scanner:status
 * - Client events: scan:start, scan:cancel
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { ScanState, ServerEvent } from '@/shared/types';
import { logger } from '../logger';
import { generatePreviews, type PhotoPreview } from '../processing/thumbnail';
import type { ScanOrchestrator } from '../services/scan-orchestrator';

/**
 * Interface for client-to-server events
 */
interface ClientToServerEvents {
  'scan:start': (data: { scanType: 'front' | 'back' }) => void;
  'scan:cancel': (data: { scanId: string }) => void;
}

/**
 * Interface for server-to-client events
 */
interface ServerToClientEvents {
  'scan:progress': (data: ServerEvent & { type: 'scan:progress' }) => void;
  'scan:complete': (data: ServerEvent & { type: 'scan:complete' }) => void;
  'scan:error': (data: ServerEvent & { type: 'scan:error' }) => void;
  'scanner:status': (data: ServerEvent & { type: 'scanner:status' }) => void;
  'state:changed': (data: ScanState) => void;
  'photos:detected': (data: { scanId: string; previews: PhotoPreview[] }) => void;
}

/**
 * Typed Socket.IO server instance
 */
type TypedSocketServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

/**
 * Typed Socket instance
 */
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Initialize Socket.IO event handlers with the scan orchestrator
 *
 * @param io - Socket.IO server instance
 * @param orchestrator - ScanOrchestrator instance for handling scan operations
 */
export const initializeSocketHandler = (
  io: TypedSocketServer,
  orchestrator: ScanOrchestrator,
): void => {
  // Subscribe to orchestrator events and broadcast to all clients
  setupOrchestratorListeners(io, orchestrator);

  // Handle client connections
  io.on('connection', (socket: TypedSocket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // Send initial scanner status
    void checkAndEmitScannerStatus(socket, orchestrator);

    // Send current workflow state
    const currentState = orchestrator.getState();
    socket.emit('state:changed', currentState);

    // Handle scan:start event
    socket.on('scan:start', async ({ scanType }) => {
      logger.info({ socketId: socket.id, scanType }, 'Received scan:start request');

      try {
        if (scanType === 'front') {
          await orchestrator.startFrontScan();
        } else if (scanType === 'back') {
          await orchestrator.startBackScan();
        } else {
          throw new Error(`Invalid scan type: ${scanType}`);
        }
      } catch (error) {
        logger.error({ socketId: socket.id, err: error }, 'Scan failed');
        // Error will be emitted via orchestrator's error event
      }
    });

    // Handle scan:cancel event
    socket.on('scan:cancel', ({ scanId }) => {
      logger.warn({ socketId: socket.id, scanId }, 'Scan cancellation not yet implemented');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Client disconnected');
    });
  });

  logger.info('Socket.IO handler initialized');
};

/**
 * Set up event listeners on the orchestrator and broadcast to all clients
 *
 * @param io - Socket.IO server instance
 * @param orchestrator - ScanOrchestrator instance
 */
const setupOrchestratorListeners = (
  io: TypedSocketServer,
  orchestrator: ScanOrchestrator,
): void => {
  // Broadcast state changes
  orchestrator.on('state:changed', (state: ScanState) => {
    logger.debug({ status: state.status }, 'State changed');
    io.emit('state:changed', state);
  });

  // Broadcast scan progress
  orchestrator.on('scan:progress', (scanId: string, progress: number) => {
    logger.debug({ scanId, progress }, 'Scan progress');
    io.emit('scan:progress', {
      type: 'scan:progress',
      scanId,
      progress,
    });
  });

  // Broadcast scan completion
  orchestrator.on('scan:complete', async (scanId: string, photosDetected: number) => {
    logger.info({ scanId, photosDetected }, 'Scan complete');
    io.emit('scan:complete', {
      type: 'scan:complete',
      scanId,
      photos: photosDetected,
    });

    // Generate and emit photo previews
    const frontScanResult = orchestrator.getFrontScanResult();
    if (frontScanResult?.detectedPhotos) {
      try {
        const previews = await generatePreviews(frontScanResult.detectedPhotos);
        io.emit('photos:detected', { scanId, previews });
      } catch (error) {
        logger.error({ err: error }, 'Failed to generate photo previews');
      }
    }
  });

  // Broadcast scan errors
  orchestrator.on('scan:error', (scanId: string, error: Error) => {
    logger.error({ scanId, err: error }, 'Scan error');
    io.emit('scan:error', {
      type: 'scan:error',
      scanId,
      message: error.message,
    });
  });

  // Broadcast batch completion
  orchestrator.on('batch:complete', (result) => {
    logger.info({ batchId: result.batchId, pairsSaved: result.pairsSaved }, 'Batch complete');
    io.emit('scan:complete', {
      type: 'scan:complete',
      scanId: result.batchId,
      photos: result.pairsSaved,
    });
  });
};

/**
 * Check scanner availability and emit status to a specific client
 *
 * @param socket - Socket instance to emit to
 * @param orchestrator - ScanOrchestrator instance
 */
const checkAndEmitScannerStatus = async (
  socket: TypedSocket,
  orchestrator: ScanOrchestrator,
): Promise<void> => {
  try {
    const available = await orchestrator.isScannerReady();
    socket.emit('scanner:status', {
      type: 'scanner:status',
      available,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to check scanner status');
    socket.emit('scanner:status', {
      type: 'scanner:status',
      available: false,
    });
  }
};
