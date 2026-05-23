import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PROGRESS_WEIGHTS } from '../../src/shared/constants';
import type {
  BatchResult,
  DetectedPhoto,
  GridPosition,
  ScanResult,
  ScanState,
} from '../../src/shared/types';

type DiscoveredScannerLike = {
  name: string;
  host: string;
  port: number;
  addresses: string[];
};

const mockScanner: DiscoveredScannerLike = {
  name: 'Test Scanner',
  host: 'scanner.local',
  port: 80,
  addresses: ['192.168.1.10'],
};

// Real (tiny) JPEG buffer so sharp(...).extract() works against it.
const realImageBuffer = await sharp({
  create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .jpeg()
  .toBuffer();

// Mutable mock state — reset in beforeEach
let discoverScannersImpl: (timeoutMs?: number) => Promise<DiscoveredScannerLike[]>;
let performScanImpl: (
  scanner: DiscoveredScannerLike,
  options: unknown,
  timeoutMs: number,
  progressCallback?: (stage: 'initiating' | 'scanning' | 'downloading', progress: number) => void,
) => Promise<Buffer>;
let detectPhotosImpl: (
  buffer: Buffer,
  dpi: number,
) => Promise<{ photos: DetectedPhoto[]; processingTime: number; warnings?: string[] }>;
let enhancePhotoImpl: (buffer: Buffer, options: unknown) => Promise<{ buffer: Buffer }>;

mock.module('../../src/server/services/scanner', () => ({
  discoverScanners: (timeoutMs?: number) => discoverScannersImpl(timeoutMs),
  performScan: (
    scanner: DiscoveredScannerLike,
    options: unknown,
    timeoutMs: number,
    progressCallback?: (stage: 'initiating' | 'scanning' | 'downloading', progress: number) => void,
  ) => performScanImpl(scanner, options, timeoutMs, progressCallback),
}));

mock.module('../../src/server/detection/photo-detector', () => ({
  detectPhotos: (buffer: Buffer, dpi: number) => detectPhotosImpl(buffer, dpi),
}));

mock.module('../../src/server/processing/enhancer', () => ({
  enhancePhoto: (buffer: Buffer, options: unknown) => enhancePhotoImpl(buffer, options),
  PRESET_STANDARD: { normalize: true, sharpen: true },
  PRESET_LIGHT: { normalize: true },
  PRESET_VINTAGE: { normalize: true },
}));

// OCR is stubbed to a no-op so unit tests don't spawn a real Tesseract worker
// (Tesseract cannot process the synthetic Buffers used here and would raise).
mock.module('../../src/server/processing/ocr', () => ({
  extractMetadata: async (_image: Buffer) => ({ confidence: 0, words: [] }),
}));

// Import AFTER mock.module calls so the orchestrator picks up the mocked modules
const { ScanOrchestrator, createScanOrchestrator } = await import(
  '../../src/server/services/scan-orchestrator'
);
const { ScannerError, DetectionError, ProcessingError, StorageError } = await import(
  '../../src/server/errors'
);

const mockEnhancedBuffer = Buffer.from('mock-enhanced-image');

function makeDetectedPhoto(
  position: GridPosition,
  overrides?: Partial<DetectedPhoto>,
): DetectedPhoto {
  return {
    image: Buffer.from(`detected-${position}`),
    position,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    confidence: 0.95,
    ...overrides,
  };
}

function attachListeners(orchestrator: InstanceType<typeof ScanOrchestrator>) {
  const events = {
    stateChanged: [] as ScanState[],
    started: [] as Array<{ scanId: string; type: 'front' | 'back' }>,
    progress: [] as Array<{ scanId: string; progress: number }>,
    complete: [] as Array<{ scanId: string; photosDetected: number }>,
    errors: [] as Array<{ scanId: string; error: Error }>,
    batchComplete: [] as BatchResult[],
  };
  orchestrator.on('state:changed', (state: ScanState) => events.stateChanged.push(state));
  orchestrator.on('scan:started', (scanId: string, type: 'front' | 'back') =>
    events.started.push({ scanId, type }),
  );
  orchestrator.on('scan:progress', (scanId: string, progress: number) =>
    events.progress.push({ scanId, progress }),
  );
  orchestrator.on('scan:complete', (scanId: string, photosDetected: number) =>
    events.complete.push({ scanId, photosDetected }),
  );
  orchestrator.on('scan:error', (scanId: string, error: Error) =>
    events.errors.push({ scanId, error }),
  );
  orchestrator.on('batch:complete', (result: BatchResult) => events.batchComplete.push(result));
  return events;
}

async function makeOrchestrator(opts?: { scanTimeout?: number }) {
  const tmp = await mkdtemp(join(tmpdir(), 'scansift-orch-'));
  const orchestrator = new ScanOrchestrator({ outputDirectory: tmp, ...opts });
  return { orchestrator, tmp, cleanup: () => rm(tmp, { recursive: true, force: true }) };
}

beforeEach(() => {
  discoverScannersImpl = async () => [mockScanner];
  performScanImpl = async (_scanner, _options, _timeoutMs, _progressCallback) => realImageBuffer;
  detectPhotosImpl = async () => ({
    photos: [
      makeDetectedPhoto('top-left', { bounds: { x: 0, y: 0, width: 100, height: 100 } }),
      makeDetectedPhoto('top-right', { bounds: { x: 100, y: 0, width: 100, height: 100 } }),
    ],
    processingTime: 5,
  });
  enhancePhotoImpl = async () => ({ buffer: mockEnhancedBuffer });
});

describe('ScanOrchestrator', () => {
  describe('Initial state', () => {
    test('starts in idle state', () => {
      const orchestrator = new ScanOrchestrator();
      expect(orchestrator.getState()).toEqual({ status: 'idle' });
    });

    test('createScanOrchestrator factory returns an instance in idle state', () => {
      const orchestrator = createScanOrchestrator();
      expect(orchestrator).toBeInstanceOf(ScanOrchestrator);
      expect(orchestrator.getState().status).toBe('idle');
    });

    test('getFrontScanResult returns null initially', () => {
      const orchestrator = new ScanOrchestrator();
      expect(orchestrator.getFrontScanResult()).toBeNull();
    });
  });

  describe('isScannerReady', () => {
    test('returns true when discovery returns at least one scanner', async () => {
      discoverScannersImpl = async () => [mockScanner];
      const orchestrator = new ScanOrchestrator();
      expect(await orchestrator.isScannerReady()).toBe(true);
    });

    test('returns false when discovery returns empty result', async () => {
      discoverScannersImpl = async () => [];
      const orchestrator = new ScanOrchestrator();
      expect(await orchestrator.isScannerReady()).toBe(false);
    });

    test('returns false when discovery throws', async () => {
      discoverScannersImpl = async () => {
        throw new Error('mDNS unavailable');
      };
      const orchestrator = new ScanOrchestrator();
      expect(await orchestrator.isScannerReady()).toBe(false);
    });

    test('uses the quick discovery timeout', async () => {
      let observedTimeout: number | undefined;
      discoverScannersImpl = async (timeoutMs?: number) => {
        observedTimeout = timeoutMs;
        return [mockScanner];
      };
      const orchestrator = new ScanOrchestrator();
      await orchestrator.isScannerReady();
      // QUICK_DISCOVERY_TIMEOUT_MS is 5000 per constants.ts
      expect(observedTimeout).toBe(5000);
    });
  });

  describe('startFrontScan happy path', () => {
    test('transitions idle -> scanning_fronts -> processing_fronts -> ready_for_backs', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      const result = await orchestrator.startFrontScan();

      const statuses = events.stateChanged.map((s) => s.status);
      expect(statuses).toEqual(['scanning_fronts', 'processing_fronts', 'ready_for_backs']);
      expect(orchestrator.getState().status).toBe('ready_for_backs');
      expect(result.photosDetected).toBe(2);
      expect(result.detectedPhotos).toHaveLength(2);
      await cleanup();
    });

    test('emits scan:started with type "front" and the same scanId as state', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      const result = await orchestrator.startFrontScan();

      expect(events.started).toHaveLength(1);
      expect(events.started[0]?.type).toBe('front');
      expect(events.started[0]?.scanId).toBe(result.scanId);
      await cleanup();
    });

    test('emits scan:complete with photo count after processing', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      const result = await orchestrator.startFrontScan();

      expect(events.complete).toHaveLength(1);
      expect(events.complete[0]?.scanId).toBe(result.scanId);
      expect(events.complete[0]?.photosDetected).toBe(2);
      await cleanup();
    });

    test('stores front scan result for later retrieval', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const result = await orchestrator.startFrontScan();
      expect(orchestrator.getFrontScanResult()).toBe(result);
      await cleanup();
    });

    test('ready_for_backs state carries frontScanId and photosDetected', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const result = await orchestrator.startFrontScan();
      const state = orchestrator.getState();
      expect(state.status).toBe('ready_for_backs');
      if (state.status === 'ready_for_backs') {
        expect(state.frontScanId).toBe(result.scanId);
        expect(state.photosDetected).toBe(2);
      }
      await cleanup();
    });

    test('rejects when called from non-idle state', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();
      // Now we are in ready_for_backs
      expect(orchestrator.startFrontScan()).rejects.toThrow(/Cannot start front scan/);
      await cleanup();
    });
  });

  describe('startFrontScan error paths', () => {
    test('throws ScannerError when discovery returns no scanners', async () => {
      discoverScannersImpl = async () => [];
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      await expect(orchestrator.startFrontScan()).rejects.toBeInstanceOf(ScannerError);

      const finalState = orchestrator.getState();
      expect(finalState.status).toBe('error');
      if (finalState.status === 'error') {
        expect(finalState.recoverable).toBe(true);
      }
      expect(events.errors).toHaveLength(1);
      await cleanup();
    });

    test('throws ScannerError when performScan rejects', async () => {
      performScanImpl = async () => {
        throw new ScannerError('Connection refused');
      };
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      await expect(orchestrator.startFrontScan()).rejects.toBeInstanceOf(ScannerError);
      expect(orchestrator.getState().status).toBe('error');
      expect(events.errors[0]?.error).toBeInstanceOf(ScannerError);
      await cleanup();
    });

    test('throws DetectionError when no photos detected', async () => {
      detectPhotosImpl = async () => ({ photos: [], processingTime: 1 });
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      await expect(orchestrator.startFrontScan()).rejects.toBeInstanceOf(DetectionError);
      const state = orchestrator.getState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.recoverable).toBe(true);
      }
      expect(events.errors[0]?.error).toBeInstanceOf(DetectionError);
      await cleanup();
    });

    test('throws DetectionError when detector throws', async () => {
      detectPhotosImpl = async () => {
        throw new DetectionError('Detection algorithm failed', 0);
      };
      const { orchestrator, cleanup } = await makeOrchestrator();

      await expect(orchestrator.startFrontScan()).rejects.toBeInstanceOf(DetectionError);
      expect(orchestrator.getState().status).toBe('error');
      await cleanup();
    });

    test('throws ProcessingError when enhancement fails', async () => {
      enhancePhotoImpl = async () => {
        throw new Error('Sharp internal error');
      };
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      await expect(orchestrator.startFrontScan()).rejects.toBeInstanceOf(ProcessingError);
      const state = orchestrator.getState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.recoverable).toBe(true);
      }
      expect(events.errors[0]?.error).toBeInstanceOf(ProcessingError);
      await cleanup();
    });

    test('error state message reflects the underlying error', async () => {
      performScanImpl = async () => {
        throw new ScannerError('Scanner timeout occurred');
      };
      const { orchestrator, cleanup } = await makeOrchestrator();
      await expect(orchestrator.startFrontScan()).rejects.toThrow();

      const state = orchestrator.getState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.message).toContain('Scanner timeout occurred');
      }
      await cleanup();
    });
  });

  describe('startBackScan', () => {
    test('rejects when called from idle state', async () => {
      const orchestrator = new ScanOrchestrator();
      expect(orchestrator.startBackScan()).rejects.toThrow(/Cannot start back scan/);
    });

    test('rejects when not in ready_for_backs (post-error)', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      detectPhotosImpl = async () => ({ photos: [], processingTime: 1 });
      await expect(orchestrator.startFrontScan()).rejects.toBeInstanceOf(DetectionError);
      // State is now 'error'
      expect(orchestrator.startBackScan()).rejects.toThrow(/Cannot start back scan/);
      await cleanup();
    });

    test('runs full back scan when in ready_for_backs', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      const events = attachListeners(orchestrator);
      const backResult = await orchestrator.startBackScan();

      expect(backResult.photosDetected).toBe(2);
      const statuses = events.stateChanged.map((s) => s.status);
      expect(statuses).toContain('scanning_backs');
      expect(statuses).toContain('processing_backs');
      // Returns to ready_for_backs after completion
      expect(orchestrator.getState().status).toBe('ready_for_backs');
      await cleanup();
    });

    test('emits scan:started with type "back"', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      const events = attachListeners(orchestrator);
      await orchestrator.startBackScan();

      const backStarts = events.started.filter((s) => s.type === 'back');
      expect(backStarts).toHaveLength(1);
      await cleanup();
    });

    test('emits scan:complete after backs processed', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      const events = attachListeners(orchestrator);
      const backResult = await orchestrator.startBackScan();

      expect(events.complete).toHaveLength(1);
      expect(events.complete[0]?.photosDetected).toBe(2);
      expect(events.complete[0]?.scanId).toBe(backResult.scanId);
      await cleanup();
    });

    test('throws DetectionError when no back photos detected', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      detectPhotosImpl = async () => ({ photos: [], processingTime: 1 });
      await expect(orchestrator.startBackScan()).rejects.toBeInstanceOf(DetectionError);
      expect(orchestrator.getState().status).toBe('error');
      await cleanup();
    });
  });

  describe('completeBatch', () => {
    test('rejects when no front scan has been performed', () => {
      const orchestrator = new ScanOrchestrator();
      expect(orchestrator.completeBatch()).rejects.toThrow(/No front scan result/);
    });

    test('saves front-only pairs when backs are skipped', async () => {
      const { orchestrator, tmp, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);
      await orchestrator.startFrontScan();

      const result = await orchestrator.completeBatch();
      expect(result.pairsSaved).toBe(2);
      expect(result.totalPhotos).toBe(2);

      const files = await readdir(join(tmp, result.batchId));
      const fronts = files.filter((f) => f.includes('-front.jpg'));
      const backs = files.filter((f) => f.includes('-back.jpg'));
      expect(fronts).toHaveLength(2);
      expect(backs).toHaveLength(0);
      expect(events.batchComplete).toHaveLength(1);
      expect(events.batchComplete[0]?.batchId).toBe(result.batchId);
      await cleanup();
    });

    test('saves front and back pairs when both have been scanned', async () => {
      const { orchestrator, tmp, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();
      await orchestrator.startBackScan();

      const result = await orchestrator.completeBatch();
      expect(result.pairsSaved).toBe(2);
      expect(result.totalPhotos).toBe(4);

      const files = await readdir(join(tmp, result.batchId));
      const fronts = files.filter((f) => f.includes('-front.jpg'));
      const backs = files.filter((f) => f.includes('-back.jpg'));
      expect(fronts).toHaveLength(2);
      expect(backs).toHaveLength(2);
      await cleanup();
    });

    test('transitions to saving then resets to idle after completion', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      const events = attachListeners(orchestrator);
      await orchestrator.completeBatch();

      const statuses = events.stateChanged.map((s) => s.status);
      expect(statuses).toContain('saving');
      expect(statuses).toContain('complete');
      // Reset is called at the end of completeBatch, so final state is idle
      expect(orchestrator.getState().status).toBe('idle');
      await cleanup();
    });

    test('emits batch:complete with batchId, pairsSaved and totalPhotos', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();
      await orchestrator.startBackScan();

      const events = attachListeners(orchestrator);
      const result = await orchestrator.completeBatch();

      expect(events.batchComplete).toHaveLength(1);
      const emitted = events.batchComplete[0];
      expect(emitted?.batchId).toBe(result.batchId);
      expect(emitted?.pairsSaved).toBe(2);
      expect(emitted?.totalPhotos).toBe(4);
      await cleanup();
    });

    test('throws StorageError (non-recoverable) when file save fails', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      // Force writeFile inside savePair to fail by replacing front image with a value
      // that node's writeFile rejects. The orchestrator wraps the failure in StorageError.
      const frontResult = orchestrator.getFrontScanResult();
      if (frontResult) {
        for (const photo of frontResult.detectedPhotos) {
          // biome-ignore lint/suspicious/noExplicitAny: deliberately corrupting image data to trigger writeFile failure
          (photo as any).image = null;
        }
      }

      const events = attachListeners(orchestrator);

      await expect(orchestrator.completeBatch()).rejects.toBeInstanceOf(StorageError);
      const state = orchestrator.getState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.recoverable).toBe(false);
      }
      expect(events.errors[0]?.error).toBeInstanceOf(StorageError);
      await cleanup();
    });
  });

  describe('reset', () => {
    test('returns to idle from ready_for_backs', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();
      expect(orchestrator.getState().status).toBe('ready_for_backs');

      orchestrator.reset();
      expect(orchestrator.getState().status).toBe('idle');
      expect(orchestrator.getFrontScanResult()).toBeNull();
      await cleanup();
    });

    test('returns to idle from error state', async () => {
      detectPhotosImpl = async () => ({ photos: [], processingTime: 1 });
      const { orchestrator, cleanup } = await makeOrchestrator();
      await expect(orchestrator.startFrontScan()).rejects.toThrow();
      expect(orchestrator.getState().status).toBe('error');

      orchestrator.reset();
      expect(orchestrator.getState().status).toBe('idle');
      await cleanup();
    });

    test('emits state:changed when reset is called', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      const events = attachListeners(orchestrator);
      orchestrator.reset();

      expect(events.stateChanged.at(-1)?.status).toBe('idle');
      await cleanup();
    });
  });

  describe('Progress weighting', () => {
    test('emits cumulative scan progress respecting PROGRESS_WEIGHTS thresholds', async () => {
      performScanImpl = async (_scanner, _options, _timeoutMs, progressCallback) => {
        progressCallback?.('initiating', 1);
        progressCallback?.('scanning', 1);
        progressCallback?.('downloading', 1);
        return realImageBuffer;
      };

      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);
      await orchestrator.startFrontScan();

      const progresses = events.progress.map((p) => p.progress);
      // Initiating @100% -> 0 + Math.round(1 * 0.1) = 0
      expect(progresses).toContain(Math.round(1 * PROGRESS_WEIGHTS.INITIATING));
      // Scanning @100% -> 10 + round(1 * 0.7) = 11
      expect(progresses).toContain(
        PROGRESS_WEIGHTS.SCANNING_OFFSET + Math.round(1 * PROGRESS_WEIGHTS.SCANNING),
      );
      // Downloading @100% -> 80 + round(1 * 0.2) = 80
      expect(progresses).toContain(
        PROGRESS_WEIGHTS.DOWNLOADING_OFFSET + Math.round(1 * PROGRESS_WEIGHTS.DOWNLOADING),
      );
      // Detection-complete and enhancement-complete markers
      expect(progresses).toContain(PROGRESS_WEIGHTS.DETECTION_COMPLETE);
      expect(progresses).toContain(PROGRESS_WEIGHTS.ENHANCEMENT_COMPLETE);
      // Caps at 100
      expect(progresses).toContain(100);
      expect(Math.max(...progresses)).toBe(100);
      await cleanup();
    });

    test('progress values are monotonic across stages within scanning', async () => {
      performScanImpl = async (_scanner, _options, _timeoutMs, progressCallback) => {
        progressCallback?.('initiating', 0.5);
        progressCallback?.('scanning', 0.5);
        progressCallback?.('downloading', 0.5);
        return realImageBuffer;
      };
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);
      await orchestrator.startFrontScan();

      const scanStageProgresses = events.progress
        .map((p) => p.progress)
        .filter((p) => p < PROGRESS_WEIGHTS.DETECTION_COMPLETE);
      // Should be sorted ascending
      const sorted = [...scanStageProgresses].sort((a, b) => a - b);
      expect(scanStageProgresses).toEqual(sorted);
      await cleanup();
    });
  });

  describe('Event ordering', () => {
    test('state:changed events fire on every transition during the front-scan flow', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);

      await orchestrator.startFrontScan();

      const order = events.stateChanged.map((s) => s.status);
      expect(order).toEqual(['scanning_fronts', 'processing_fronts', 'ready_for_backs']);
      await cleanup();
    });

    test('does not emit batch:complete on failure', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();

      const frontResult = orchestrator.getFrontScanResult();
      if (frontResult) {
        for (const photo of frontResult.detectedPhotos) {
          // biome-ignore lint/suspicious/noExplicitAny: corrupt image to force StorageError
          (photo as any).image = null;
        }
      }

      const events = attachListeners(orchestrator);
      await expect(orchestrator.completeBatch()).rejects.toThrow();

      expect(events.batchComplete).toHaveLength(0);
      await cleanup();
    });
  });

  describe('Scanner caching', () => {
    test('reuses scanner discovered by isScannerReady when starting a scan', async () => {
      let discoveryCount = 0;
      discoverScannersImpl = async () => {
        discoveryCount += 1;
        return [mockScanner];
      };
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.isScannerReady();
      const before = discoveryCount;

      await orchestrator.startFrontScan();
      // Discovery should not be invoked again because scanner is cached
      expect(discoveryCount).toBe(before);
      await cleanup();
    });
  });

  describe('Scan result shape', () => {
    test('startFrontScan returns scanId, raw image path, timestamp and detected photos', async () => {
      const { orchestrator, tmp, cleanup } = await makeOrchestrator();
      const result: ScanResult = await orchestrator.startFrontScan();

      expect(typeof result.scanId).toBe('string');
      expect(result.scanId.length).toBeGreaterThan(0);
      expect(result.photosDetected).toBe(2);
      expect(result.detectedPhotos).toHaveLength(2);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.rawImagePath).toContain(join(tmp, 'raw'));
      expect(result.rawImagePath).toContain('-front.jpg');
      await cleanup();
    });
  });
});
