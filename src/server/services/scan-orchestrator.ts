/**
 * Scan Orchestration Service
 *
 * Coordinates the full scanning workflow using a state machine pattern:
 * idle → scanning_fronts → processing → ready_for_backs → scanning_backs → pairing → saving → complete
 *
 * Manages state transitions and integrates all processing modules:
 * - Scanner discovery and communication
 * - Photo detection from scanned images
 * - Image enhancement and cropping
 * - Front/back pairing
 * - Saving to filesystem
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
// Import types
import type {
  BatchResult,
  DetectedPhoto,
  GridPosition,
  PhotoPair,
  ScanOptions,
  ScanResult,
  ScanState,
} from '@/shared/types';
import { detectPhotos } from '../detection/photo-detector';
import { DetectionError, ProcessingError, ScannerError, StorageError } from '../errors';
import { enhancePhoto, PRESET_STANDARD } from '../processing/enhancer';
// Import existing modules
import {
  type DiscoveredScanner,
  discoverScanners,
  performScan as esclPerformScan,
  type ScanProgressCallback,
} from './scanner';

/**
 * Events emitted by the orchestrator for UI updates
 */
export interface OrchestratorEvents {
  'state:changed': (state: ScanState) => void;
  'scan:started': (scanId: string, type: 'front' | 'back') => void;
  'scan:progress': (scanId: string, progress: number) => void;
  'scan:complete': (scanId: string, photosDetected: number) => void;
  'scan:error': (scanId: string, error: Error) => void;
  'batch:complete': (result: BatchResult) => void;
}

/**
 * Default scan options
 */
const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  resolution: 300,
  colorMode: 'RGB24',
  format: 'image/jpeg',
};

/**
 * Default output directory for saved photos
 */
const DEFAULT_OUTPUT_DIR = './scanned-photos';

/**
 * Default scan timeout in milliseconds (2 minutes)
 */
const DEFAULT_SCAN_TIMEOUT = 120000;

/**
 * Scan Orchestrator Service
 *
 * Manages the complete scanning workflow with state tracking and event emission.
 */
export class ScanOrchestrator extends EventEmitter {
  private state: ScanState = { status: 'idle' };
  private currentScanner: DiscoveredScanner | null = null;
  public frontScanResult: ScanResult | null = null;
  private backScanResult: ScanResult | null = null;
  private scanTimeout: number;
  private outputDirectory: string;

  constructor(options?: { scanTimeout?: number; outputDirectory?: string }) {
    super();
    this.scanTimeout = options?.scanTimeout ?? DEFAULT_SCAN_TIMEOUT;
    this.outputDirectory = options?.outputDirectory ?? DEFAULT_OUTPUT_DIR;
  }

  /**
   * Get current workflow state
   */
  getState(): ScanState {
    return this.state;
  }

  /**
   * Check if scanner is ready
   */
  async isScannerReady(): Promise<boolean> {
    try {
      const scanners = await discoverScanners(5000); // Quick 5s discovery
      this.currentScanner = scanners[0] ?? null;
      return this.currentScanner !== null;
    } catch {
      return false;
    }
  }

  /**
   * Start front scan operation
   *
   * @param options - Scan options (resolution, color mode, format)
   * @returns Promise resolving to scan result with detected photos
   * @throws ScannerError if no scanner found
   * @throws DetectionError if no photos detected
   */
  async startFrontScan(options?: ScanOptions): Promise<ScanResult> {
    // Validate state
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start front scan from state: ${this.state.status}`);
    }

    const scanId = randomUUID();
    const mergedOptions = { ...DEFAULT_SCAN_OPTIONS, ...options };

    try {
      // Update state to scanning
      this.updateState({ status: 'scanning_fronts', scanId });
      this.emit('scan:started', scanId, 'front');

      // Discover scanner
      const scanner = await this.ensureScanner();

      // Perform scan (placeholder - actual eSCL implementation would go here)
      const rawImage = await this.performScan(scanner, mergedOptions, scanId, 'front');

      // Save raw scan
      const rawImagePath = await this.saveRawScan(rawImage, scanId, 'front');

      // Update state to processing
      this.updateState({
        status: 'processing_fronts',
        scanId,
        progress: 0,
      });

      // Detect photos
      this.emit('scan:progress', scanId, 30);
      const detectionResult = await detectPhotos(rawImage, mergedOptions.resolution);

      if (detectionResult.photos.length === 0) {
        throw new DetectionError('No photos detected in scan', 0);
      }

      this.emit('scan:progress', scanId, 60);

      // Crop and enhance photos
      const detectedPhotos = await this.cropAndEnhancePhotos(
        rawImage,
        detectionResult.photos,
        scanId,
      );

      this.emit('scan:progress', scanId, 100);

      // Create scan result
      const scanResult: ScanResult = {
        scanId,
        photosDetected: detectedPhotos.length,
        rawImagePath,
        timestamp: new Date(),
        detectedPhotos,
      };

      // Store for later pairing
      this.frontScanResult = scanResult;

      // Update state to ready for backs
      this.updateState({
        status: 'ready_for_backs',
        frontScanId: scanId,
        photosDetected: detectedPhotos.length,
      });

      this.emit('scan:complete', scanId, detectedPhotos.length);

      return scanResult;
    } catch (error) {
      this.handleError(scanId, error as Error);
      throw error;
    }
  }

  /**
   * Start back scan operation
   *
   * Must be called after front scan completes.
   *
   * @param options - Scan options (uses same as front scan if not specified)
   * @returns Promise resolving to scan result with detected photos
   * @throws Error if front scan hasn't been completed
   * @throws ScannerError if no scanner found
   */
  async startBackScan(options?: ScanOptions): Promise<ScanResult> {
    // Validate state
    if (this.state.status !== 'ready_for_backs') {
      throw new Error(
        `Cannot start back scan from state: ${this.state.status}. Must complete front scan first.`,
      );
    }

    if (!this.frontScanResult) {
      throw new Error('No front scan result available');
    }

    const scanId = randomUUID();
    const mergedOptions = { ...DEFAULT_SCAN_OPTIONS, ...options };

    try {
      // Update state to scanning backs
      this.updateState({
        status: 'scanning_backs',
        frontScanId: this.frontScanResult.scanId,
        backScanId: scanId,
      });
      this.emit('scan:started', scanId, 'back');

      // Discover scanner
      const scanner = await this.ensureScanner();

      // Perform scan
      const rawImage = await this.performScan(scanner, mergedOptions, scanId, 'back');

      // Save raw scan
      const rawImagePath = await this.saveRawScan(rawImage, scanId, 'back');

      // Update state to processing
      this.updateState({
        status: 'processing_backs',
        frontScanId: this.frontScanResult.scanId,
        backScanId: scanId,
        progress: 0,
      });

      // Detect photos
      this.emit('scan:progress', scanId, 30);
      const detectionResult = await detectPhotos(rawImage, mergedOptions.resolution);

      if (detectionResult.photos.length === 0) {
        throw new DetectionError('No photos detected in back scan', 0);
      }

      this.emit('scan:progress', scanId, 60);

      // Crop and enhance photos
      const detectedPhotos = await this.cropAndEnhancePhotos(
        rawImage,
        detectionResult.photos,
        scanId,
      );

      this.emit('scan:progress', scanId, 100);

      // Create scan result
      const scanResult: ScanResult = {
        scanId,
        photosDetected: detectedPhotos.length,
        rawImagePath,
        timestamp: new Date(),
        detectedPhotos,
      };

      // Store for pairing
      this.backScanResult = scanResult;

      this.emit('scan:complete', scanId, detectedPhotos.length);

      // Automatically transition to ready state (user will call completeBatch)
      this.updateState({
        status: 'ready_for_backs',
        frontScanId: this.frontScanResult.scanId,
        photosDetected: this.frontScanResult.photosDetected,
      });

      return scanResult;
    } catch (error) {
      this.handleError(scanId, error as Error);
      throw error;
    }
  }

  /**
   * Complete batch: pair fronts with backs and save to filesystem
   *
   * @returns Promise resolving to batch result
   * @throws Error if no front scan available
   */
  async completeBatch(): Promise<BatchResult> {
    if (!this.frontScanResult) {
      throw new Error('No front scan result available to complete batch');
    }

    const batchId = randomUUID();

    try {
      // Update state to saving
      this.updateState({ status: 'saving', batchId });

      // Pair photos
      const pairs = this.pairPhotos(
        this.frontScanResult.detectedPhotos,
        this.backScanResult?.detectedPhotos ?? [],
      );

      // Create output directory
      const batchDir = join(this.outputDirectory, batchId);
      await mkdir(batchDir, { recursive: true });

      // Save pairs
      let savedCount = 0;
      for (const pair of pairs) {
        await this.savePair(pair, batchDir, savedCount);
        savedCount++;
      }

      // Create result
      const result: BatchResult = {
        batchId,
        pairsSaved: savedCount,
        totalPhotos:
          this.frontScanResult.photosDetected + (this.backScanResult?.photosDetected ?? 0),
        outputDirectory: batchDir,
        timestamp: new Date(),
      };

      // Update state to complete
      this.updateState({
        status: 'complete',
        batchId,
        photosSaved: savedCount,
      });

      this.emit('batch:complete', result);

      // Reset for next batch
      this.reset();

      return result;
    } catch (error) {
      this.handleError(batchId, error as Error);
      throw error;
    }
  }

  /**
   * Reset orchestrator to idle state
   */
  reset(): void {
    this.frontScanResult = null;
    this.backScanResult = null;
    this.updateState({ status: 'idle' });
  }

  // ============================================================================
  // Private helper methods
  // ============================================================================

  /**
   * Update state and emit change event
   */
  private updateState(newState: ScanState): void {
    this.state = newState;
    this.emit('state:changed', newState);
  }

  /**
   * Handle error and update state
   */
  private handleError(scanId: string, error: Error): void {
    const isRecoverable =
      error instanceof ScannerError ||
      error instanceof DetectionError ||
      error instanceof ProcessingError;

    this.updateState({
      status: 'error',
      message: error.message,
      recoverable: isRecoverable,
    });

    this.emit('scan:error', scanId, error);
  }

  /**
   * Ensure scanner is available
   */
  private async ensureScanner(): Promise<DiscoveredScanner> {
    if (!this.currentScanner) {
      const scanners = await discoverScanners(this.scanTimeout);
      if (scanners.length === 0) {
        throw new ScannerError('No scanner found on network');
      }
      this.currentScanner = scanners[0] ?? null;
    }
    if (!this.currentScanner) {
      throw new ScannerError('No scanner available');
    }
    return this.currentScanner;
  }

  /**
   * Perform actual scan operation using eSCL protocol
   *
   * @param scanner - The discovered scanner
   * @param options - Scan options
   * @param scanId - Unique scan identifier for logging
   * @param type - Whether this is a front or back scan
   * @returns Promise resolving to scanned image buffer
   */
  private async performScan(
    scanner: DiscoveredScanner,
    options: ScanOptions,
    scanId: string,
    type: 'front' | 'back',
  ): Promise<Buffer> {
    console.log(`[${scanId}] Scanning ${type} with ${scanner.name} at ${options.resolution}dpi`);

    // Progress callback that maps eSCL stages to overall progress
    const progressCallback: ScanProgressCallback = (stage, progress) => {
      let overallProgress = 0;
      switch (stage) {
        case 'initiating':
          overallProgress = Math.round(progress * 0.1); // 0-10%
          break;
        case 'scanning':
          overallProgress = 10 + Math.round(progress * 0.7); // 10-80%
          break;
        case 'downloading':
          overallProgress = 80 + Math.round(progress * 0.2); // 80-100%
          break;
      }
      this.emit('scan:progress', scanId, overallProgress);
    };

    // Perform the actual scan using eSCL protocol
    const imageBuffer = await esclPerformScan(scanner, options, this.scanTimeout, progressCallback);

    console.log(`[${scanId}] Scan complete: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    return imageBuffer;
  }

  /**
   * Save raw scan to temporary storage
   */
  private async saveRawScan(
    buffer: Buffer,
    scanId: string,
    type: 'front' | 'back',
  ): Promise<string> {
    const rawDir = join(this.outputDirectory, 'raw');
    await mkdir(rawDir, { recursive: true });

    const filename = `${scanId}-${type}.jpg`;
    const filepath = join(rawDir, filename);

    await writeFile(filepath, buffer);
    return filepath;
  }

  /**
   * Crop and enhance detected photos
   */
  private async cropAndEnhancePhotos(
    rawImage: Buffer,
    detectedPhotos: DetectedPhoto[],
    _scanId: string,
  ): Promise<DetectedPhoto[]> {
    const processed: DetectedPhoto[] = [];

    for (const photo of detectedPhotos) {
      try {
        // Extract region from raw image
        const cropped = await sharp(rawImage)
          .extract({
            left: photo.bounds.x,
            top: photo.bounds.y,
            width: photo.bounds.width,
            height: photo.bounds.height,
          })
          .toBuffer();

        // Enhance cropped photo
        const enhanced = await enhancePhoto(cropped, PRESET_STANDARD);

        // Update photo with processed image
        processed.push({
          ...photo,
          image: enhanced.buffer,
        });
      } catch (error) {
        console.error(`Failed to process photo at ${photo.position}:`, error);
        throw new ProcessingError(`Failed to enhance photo at ${photo.position}`);
      }
    }

    return processed;
  }

  /**
   * Pair front and back photos by grid position
   *
   * PLACEHOLDER: Simple position-based pairing
   * Production version could use image matching algorithms
   */
  private pairPhotos(fronts: DetectedPhoto[], backs: DetectedPhoto[]): PhotoPair[] {
    const pairs: PhotoPair[] = [];

    // Create map of backs by position
    const backsByPosition = new Map<GridPosition, DetectedPhoto>();
    for (const back of backs) {
      backsByPosition.set(back.position, back);
    }

    // Pair each front with corresponding back
    for (const front of fronts) {
      const back = backsByPosition.get(front.position);

      const photoPair: PhotoPair = {
        front: {
          image: front.image,
          position: front.position,
          bounds: front.bounds,
          originalBounds: front.bounds,
        },
        position: front.position,
      };

      if (back) {
        photoPair.back = {
          image: back.image,
          position: back.position,
          bounds: back.bounds,
          originalBounds: back.bounds,
        };
      }

      pairs.push(photoPair);
    }

    return pairs;
  }

  /**
   * Save photo pair to filesystem
   */
  private async savePair(pair: PhotoPair, outputDir: string, index: number): Promise<void> {
    try {
      // Generate filename with index and position
      const baseFilename = `photo-${String(index + 1).padStart(3, '0')}-${pair.position}`;

      // Save front
      const frontPath = join(outputDir, `${baseFilename}-front.jpg`);
      await writeFile(frontPath, pair.front.image);

      // Save back if available
      if (pair.back) {
        const backPath = join(outputDir, `${baseFilename}-back.jpg`);
        await writeFile(backPath, pair.back.image);
      }

      console.log(`Saved pair ${index + 1} to ${outputDir}`);
    } catch (error) {
      throw new StorageError(
        `Failed to save photo pair: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Create a new scan orchestrator instance
 */
export const createScanOrchestrator = (options?: {
  scanTimeout?: number;
  outputDirectory?: string;
}): ScanOrchestrator => {
  return new ScanOrchestrator(options);
};
