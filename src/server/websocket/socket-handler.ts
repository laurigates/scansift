/**
 * Socket.IO Handler
 *
 * Manages Socket.IO connections and integrates with the ScanOrchestrator.
 * Handles bidirectional communication between server and client:
 * - Server events: scan:progress, scan:complete, scan:error, scanner:status
 * - Client events: scan:start, scan:cancel
 */

import sharp from 'sharp';
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { ScanState } from '@/shared/types';
import type { ScanOrchestrator } from '../services/scan-orchestrator';

/**
 * Interface for client-to-server events
 */
interface ClientToServerEvents {
  'scan:start': (data: { scanType: 'front' | 'back' }) => void;
  'scan:cancel': (data: { scanId: string }) => void;
}

/**
 * Interface for photo preview data
 */
interface PhotoPreview {
  position: string;
  thumbnail: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
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
    console.log(`Client connected: ${socket.id}`);

    // Send initial scanner status
    void checkAndEmitScannerStatus(socket, orchestrator);

    // Send current workflow state
    const currentState = orchestrator.getState();
    socket.emit('state:changed', currentState);

    // Handle scan:start event
    socket.on('scan:start', async ({ scanType }) => {
      console.log(`[${socket.id}] Received scan:start request: ${scanType}`);

      try {
        if (scanType === 'front') {
          await orchestrator.startFrontScan();
        } else if (scanType === 'back') {
          await orchestrator.startBackScan();
        } else {
          throw new Error(`Invalid scan type: ${scanType}`);
        }
      } catch (error) {
        console.error(`[${socket.id}] Scan failed:`, error);
        // Error will be emitted via orchestrator's error event
      }
    });

    // Handle scan:cancel event
    socket.on('scan:cancel', ({ scanId }) => {
      console.log(`[${socket.id}] Received scan:cancel request: ${scanId}`);
      // TODO: Implement scan cancellation in orchestrator
      console.warn('Scan cancellation not yet implemented');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('Socket.IO handler initialized');
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
    console.log(`State changed: ${state.status}`);
    io.emit('state:changed', state);
  });

  // Broadcast scan progress
  orchestrator.on('scan:progress', (scanId: string, progress: number) => {
    console.log(`[${scanId}] Progress: ${progress}%`);
    io.emit('scan:progress', {
      type: 'scan:progress',
      scanId,
      progress,
    });
  });

  // Broadcast scan completion
  orchestrator.on('scan:complete', async (scanId: string, photosDetected: number) => {
    console.log(`[${scanId}] Complete: ${photosDetected} photos detected`);
    io.emit('scan:complete', {
      type: 'scan:complete',
      scanId,
      photos: photosDetected,
    });

    // Generate and emit photo previews
    const frontScanResult = orchestrator.frontScanResult;
    if (frontScanResult?.detectedPhotos) {
      try {
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

        io.emit('photos:detected', {
          scanId,
          previews,
        });
      } catch (error) {
        console.error('Failed to generate photo previews:', error);
      }
    }
  });

  // Broadcast scan errors
  orchestrator.on('scan:error', (scanId: string, error: Error) => {
    console.error(`[${scanId}] Error:`, error);
    io.emit('scan:error', {
      type: 'scan:error',
      scanId,
      message: error.message,
    });
  });

  // Broadcast batch completion
  orchestrator.on('batch:complete', (result) => {
    console.log(`Batch complete: ${result.batchId} (${result.pairsSaved} pairs saved)`);
    // This maps to scan:complete with the final count
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
    console.error('Failed to check scanner status:', error);
    socket.emit('scanner:status', {
      type: 'scanner:status',
      available: false,
    });
  }
};
