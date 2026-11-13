import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { batches, createDb, pairs, photos } from '../../src/server/db';
import type { OrchestratorDependencies } from '../../src/server/services/scan-orchestrator';
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
let enhancePhotoImpl: (
  buffer: Buffer,
  options: unknown,
) => Promise<{ buffer: Buffer; archivalBuffer?: Buffer }>;

// Mutable jobUrl that performScan reports to onJobCreated. Tests that
// exercise cancelScan reach in via setMockJobUrl() to register a known URL.
let mockJobUrl: string | null = null;
const cancelScanJobImpl = mock(async (_jobUrl: string) => undefined);

mock.module('../../src/server/services/scanner', () => ({
  discoverScanners: (timeoutMs?: number) => discoverScannersImpl(timeoutMs),
  performScan: async (
    scanner: DiscoveredScannerLike,
    options: unknown,
    timeoutMs: number,
    progressCallback?: (stage: 'initiating' | 'scanning' | 'downloading', progress: number) => void,
    onJobCreated?: (jobUrl: string) => void,
  ) => {
    if (mockJobUrl) onJobCreated?.(mockJobUrl);
    return performScanImpl(scanner, options, timeoutMs, progressCallback);
  },
  cancelScanJob: (jobUrl: string) => cancelScanJobImpl(jobUrl),
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

// Real JPEGs for tests where a date is extracted: writing the EXIF date
// decodes the image, which the placeholder buffer above cannot survive.
const makeJpeg = (r: number) =>
  sharp({ create: { width: 16, height: 16, channels: 3, background: { r, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer();
const jpegA = await makeJpeg(250);
const jpegB = await makeJpeg(5);

/** Relative paths of every file under {tmp}/processed, sorted. */
async function listProcessed(tmp: string): Promise<string[]> {
  const entries = await readdir(join(tmp, 'processed'), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(join(tmp, 'processed').length + 1))
    .sort();
}

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

async function makeOrchestrator(opts?: {
  scanTimeout?: number;
  archivalPng?: boolean;
  deps?: OrchestratorDependencies;
}) {
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
  mockJobUrl = null;
  cancelScanJobImpl.mockClear();
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

      const files = await listProcessed(tmp);
      const fronts = files.filter((f) => f.includes('_front.jpg'));
      const backs = files.filter((f) => f.includes('_back.jpg'));
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

      const files = await listProcessed(tmp);
      const fronts = files.filter((f) => f.includes('_front.jpg'));
      const backs = files.filter((f) => f.includes('_back.jpg'));
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

  describe('persistence', () => {
    test('front + back batch writes one batches row, one photos row and one pairs row per pair', async () => {
      const db = createDb(':memory:');
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db } });
      // Delay the scan so "captured at front-scan start" is distinguishable
      // from the ScanResult timestamp, which is set after detection.
      performScanImpl = async () => {
        await new Promise((r) => setTimeout(r, 20));
        return realImageBuffer;
      };

      const beforeFront = new Date().toISOString();
      const front = await orchestrator.startFrontScan();
      const back = await orchestrator.startBackScan();
      const result = await orchestrator.completeBatch();

      const batchRows = db.select().from(batches).all();
      expect(batchRows).toHaveLength(1);
      const batch = batchRows[0];
      expect(batch?.id).toBe(result.batchId);
      expect(batch?.status).toBe('complete');
      expect(batch?.outputDirectory).toBe(result.outputDirectory);
      expect(batch?.completedAt).toBeTruthy();
      // ISO-8601 UTC strings compare lexicographically in time order.
      expect((batch?.startedAt ?? '') >= beforeFront).toBe(true);
      expect((batch?.startedAt ?? 'z') < front.timestamp.toISOString()).toBe(true);
      expect((batch?.startedAt ?? 'z') <= (batch?.completedAt ?? '')).toBe(true);

      const photoRows = db.select().from(photos).orderBy(photos.id).all();
      expect(photoRows).toHaveLength(2);
      expect(photoRows.map((p) => p.gridPosition)).toEqual(['top-left', 'top-right']);
      for (const row of photoRows) {
        expect(row.batchId).toBe(result.batchId);
        expect(row.frontFilePath.startsWith(result.outputDirectory)).toBe(true);
        expect(row.frontFilePath.endsWith('_front.jpg')).toBe(true);
        await access(row.frontFilePath);
        expect(row.backFilePath?.endsWith('_back.jpg')).toBe(true);
        await access(row.backFilePath ?? '');
        expect(row.originalFrontPath).toBe(front.rawImagePath);
        expect(row.originalBackPath).toBe(back.rawImagePath);
        expect(row.scanDate).toBe(front.timestamp.toISOString());
      }

      const pairRows = db.select().from(pairs).orderBy(pairs.id).all();
      expect(pairRows).toHaveLength(2);
      expect(pairRows.map((p) => p.frontPhotoId)).toEqual(photoRows.map((p) => p.id));
      for (const row of pairRows) {
        expect(row.batchId).toBe(result.batchId);
        expect(row.backPhotoId).toBeNull();
      }
      await cleanup();
    });

    test('front-only batch leaves back_file_path and original_back_path null', async () => {
      const db = createDb(':memory:');
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db } });
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const photoRows = db.select().from(photos).all();
      expect(photoRows).toHaveLength(2);
      for (const row of photoRows) {
        expect(row.backFilePath).toBeNull();
        expect(row.originalBackPath).toBeNull();
      }
      expect(db.select().from(pairs).all()).toHaveLength(2);
      await cleanup();
    });

    test('maps OCR metadata to photo_date, extracted_text and confidence_score, preferring the back', async () => {
      const db = createDb(':memory:');
      const backDate = new Date('1985-07-20T00:00:00.000Z');
      // The enhancer stub returns one buffer per call, so tag each side to
      // let the OCR stub tell fronts from backs.
      let side: 'front' | 'back' = 'front';
      enhancePhotoImpl = async () => ({ buffer: side === 'back' ? jpegB : jpegA });
      const extractMetadata: OrchestratorDependencies['extractMetadata'] = async (image) =>
        image.equals(jpegB)
          ? { extractedText: 'Summer 1985', extractedDate: backDate, confidence: 0.8, words: [] }
          : { extractedText: 'front text', confidence: 0.3, words: [] };
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db, extractMetadata } });

      await orchestrator.startFrontScan();
      side = 'back';
      await orchestrator.startBackScan();
      await orchestrator.completeBatch();

      const photoRows = db.select().from(photos).all();
      expect(photoRows).toHaveLength(2);
      for (const row of photoRows) {
        expect(row.photoDate).toBe(backDate.toISOString());
        expect(row.extractedText).toBe('Summer 1985');
        expect(row.confidenceScore).toBeCloseTo(0.8);
      }
      await cleanup();
    });

    test('falls back to front OCR metadata when there is no back', async () => {
      const db = createDb(':memory:');
      const frontDate = new Date('1990-01-02T00:00:00.000Z');
      enhancePhotoImpl = async () => ({ buffer: jpegA });
      const extractMetadata: OrchestratorDependencies['extractMetadata'] = async () => ({
        extractedText: 'Jan 1990',
        extractedDate: frontDate,
        confidence: 0.6,
        words: [],
      });
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db, extractMetadata } });
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const [row] = db.select().from(photos).all();
      expect(row?.photoDate).toBe(frontDate.toISOString());
      expect(row?.extractedText).toBe('Jan 1990');
      expect(row?.confidenceScore).toBeCloseTo(0.6);
      await cleanup();
    });

    test('stores detection confidence and null text/date when OCR finds no text', async () => {
      const db = createDb(':memory:');
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db } });
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const [row] = db.select().from(photos).all();
      expect(row?.photoDate).toBeNull();
      expect(row?.extractedText).toBeNull();
      // makeDetectedPhoto sets detection confidence to 0.95
      expect(row?.confidenceScore).toBeCloseTo(0.95);
      await cleanup();
    });

    test('a failing database write does not abort the batch', async () => {
      const db = createDb(':memory:');
      // Every statement against a closed connection throws.
      db.$client.close();
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({ deps: { db } });
      const events = attachListeners(orchestrator);
      await orchestrator.startFrontScan();

      const result = await orchestrator.completeBatch();

      expect(result.pairsSaved).toBe(2);
      const files = await listProcessed(tmp);
      expect(files.filter((f) => f.includes('_front.jpg'))).toHaveLength(2);
      expect(events.batchComplete).toHaveLength(1);
      expect(events.errors).toHaveLength(0);
      expect(orchestrator.getState().status).toBe('idle');
      await cleanup();
    });

    test('a write that fails part-way leaves no rows behind', async () => {
      const db = createDb(':memory:');
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db } });
      await orchestrator.startFrontScan();
      // The batches row is inserted before the photos rows; a NOT NULL
      // violation on photos.original_front_path must roll it back.
      const frontResult = orchestrator.getFrontScanResult();
      if (frontResult) {
        // biome-ignore lint/suspicious/noExplicitAny: force a NOT NULL violation on original_front_path
        (frontResult as any).rawImagePath = null;
      }

      const result = await orchestrator.completeBatch();

      expect(result.pairsSaved).toBe(2);
      expect(db.select().from(batches).all()).toHaveLength(0);
      expect(db.select().from(photos).all()).toHaveLength(0);
      expect(db.select().from(pairs).all()).toHaveLength(0);
      await cleanup();
    });

    test('a second batch records its own started_at', async () => {
      const db = createDb(':memory:');
      const { orchestrator, cleanup } = await makeOrchestrator({ deps: { db } });
      await orchestrator.startFrontScan();
      const first = await orchestrator.completeBatch();
      await new Promise((r) => setTimeout(r, 5));
      await orchestrator.startFrontScan();
      const second = await orchestrator.completeBatch();

      const rows = db.select().from(batches).all();
      expect(rows).toHaveLength(2);
      const firstRow = rows.find((r) => r.id === first.batchId);
      const secondRow = rows.find((r) => r.id === second.batchId);
      expect((secondRow?.startedAt ?? '') > (firstRow?.completedAt ?? 'z')).toBe(true);
      expect(db.select().from(photos).all()).toHaveLength(4);
      await cleanup();
    });
  });

  describe('date-based output', () => {
    const june14 = new Date(1987, 5, 14, 12, 0, 0);
    const datedDir = join('1987', '06');

    /** Enhancer stub: top-left becomes jpegA, top-right jpegB, on every scan. */
    const enhanceByPosition = () => {
      let calls = 0;
      enhancePhotoImpl = async () => ({ buffer: calls++ % 2 === 0 ? jpegA : jpegB });
    };

    test('writes dated pairs under processed/YYYY/MM and undated pairs under processed/unknown, each with a sidecar', async () => {
      const db = createDb(':memory:');
      enhanceByPosition();
      const extractMetadata: OrchestratorDependencies['extractMetadata'] = async (image) =>
        image.equals(jpegA)
          ? { extractedText: 'June 14 1987', extractedDate: june14, confidence: 0.9, words: [] }
          : { extractedText: 'Grandma', confidence: 0.4, words: [] };
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({
        deps: { db, extractMetadata },
      });

      const front = await orchestrator.startFrontScan();
      const result = await orchestrator.completeBatch();

      expect(await listProcessed(tmp)).toEqual([
        join(datedDir, '1987-06-14_001.json'),
        join(datedDir, '1987-06-14_001_front.jpg'),
        join('unknown', 'unknown_001.json'),
        join('unknown', 'unknown_001_front.jpg'),
      ]);
      expect(result.outputDirectory).toBe(join(tmp, 'processed'));
      expect(result.pairsSaved).toBe(2);

      const datedFront = join(tmp, 'processed', datedDir, '1987-06-14_001_front.jpg');
      const undatedFront = join(tmp, 'processed', 'unknown', 'unknown_001_front.jpg');

      const dated = JSON.parse(
        await readFile(join(tmp, 'processed', datedDir, '1987-06-14_001.json'), 'utf8'),
      );
      expect(dated).toMatchObject({
        batchId: result.batchId,
        gridPosition: 'top-left',
        scanDate: front.timestamp.toISOString(),
        photoDate: '1987-06-14',
        front: '1987-06-14_001_front.jpg',
        back: null,
      });
      expect(dated.ocr.front.extractedText).toBe('June 14 1987');

      const undated = JSON.parse(
        await readFile(join(tmp, 'processed', 'unknown', 'unknown_001.json'), 'utf8'),
      );
      expect(undated.photoDate).toBeNull();
      expect(undated.gridPosition).toBe('top-right');
      expect(undated.ocr.front.extractedText).toBe('Grandma');

      // The date is written to EXIF only where one was extracted; undated
      // photos are stored byte-for-byte as enhanced.
      const exif = (await sharp(datedFront).metadata()).exif;
      expect(exif?.toString('latin1')).toContain('1987:06:14 12:00:00');
      expect((await readFile(undatedFront)).equals(jpegB)).toBe(true);

      // The database rows point at the files that were written.
      const rows = db.select().from(photos).orderBy(photos.id).all();
      expect(rows.map((row) => row.frontFilePath)).toEqual([datedFront, undatedFront]);
      expect(db.select().from(batches).all()[0]?.outputDirectory).toBe(join(tmp, 'processed'));
      await cleanup();
    });

    test('writes the back next to the front and tags both with the EXIF date', async () => {
      const db = createDb(':memory:');
      enhancePhotoImpl = async () => ({ buffer: jpegA });
      const extractMetadata: OrchestratorDependencies['extractMetadata'] = async () => ({
        extractedText: 'June 14 1987',
        extractedDate: june14,
        confidence: 0.9,
        words: [],
      });
      detectPhotosImpl = async () => ({
        photos: [makeDetectedPhoto('top-left')],
        processingTime: 5,
      });
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({
        deps: { db, extractMetadata },
      });

      await orchestrator.startFrontScan();
      await orchestrator.startBackScan();
      await orchestrator.completeBatch();

      expect(await listProcessed(tmp)).toEqual([
        join(datedDir, '1987-06-14_001.json'),
        join(datedDir, '1987-06-14_001_back.jpg'),
        join(datedDir, '1987-06-14_001_front.jpg'),
      ]);
      const backPath = join(tmp, 'processed', datedDir, '1987-06-14_001_back.jpg');
      const frontPath = join(tmp, 'processed', datedDir, '1987-06-14_001_front.jpg');
      for (const path of [frontPath, backPath]) {
        const exif = (await sharp(path).metadata()).exif;
        expect(exif?.toString('latin1')).toContain('1987:06:14 12:00:00');
      }
      const sidecar = JSON.parse(
        await readFile(join(tmp, 'processed', datedDir, '1987-06-14_001.json'), 'utf8'),
      );
      expect(sidecar.back).toBe('1987-06-14_001_back.jpg');

      const [row] = db.select().from(photos).all();
      expect(row?.frontFilePath).toBe(frontPath);
      expect(row?.backFilePath).toBe(backPath);
      await cleanup();
    });

    test('continues the sequence within a batch and across batches instead of overwriting', async () => {
      enhancePhotoImpl = async () => ({ buffer: jpegA });
      const extractMetadata: OrchestratorDependencies['extractMetadata'] = async () => ({
        extractedDate: june14,
        confidence: 0.9,
        words: [],
      });
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({ deps: { extractMetadata } });

      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const fronts = (await listProcessed(tmp)).filter((f) => f.endsWith('_front.jpg'));
      expect(fronts).toEqual([
        join(datedDir, '1987-06-14_001_front.jpg'),
        join(datedDir, '1987-06-14_002_front.jpg'),
        join(datedDir, '1987-06-14_003_front.jpg'),
        join(datedDir, '1987-06-14_004_front.jpg'),
      ]);
      await cleanup();
    });

    test('continues the unknown sequence across batches', async () => {
      const { orchestrator, tmp, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const fronts = (await listProcessed(tmp)).filter((f) => f.endsWith('_front.jpg'));
      expect(fronts).toEqual([1, 2, 3, 4].map((n) => join('unknown', `unknown_00${n}_front.jpg`)));
      await cleanup();
    });
  });

  describe('PNG archival copy', () => {
    const pngOf = (label: string) => Buffer.from(`archival-png-${label}`);

    /**
     * Enhancer stub that honours the archivalPng option the way the real
     * enhancer does, and records the options of every call. Each call gets
     * its own PNG so a mixed-up front/back is visible.
     */
    const enhanceWithArchival = () => {
      const seenOptions: unknown[] = [];
      enhancePhotoImpl = async (_buffer, options) => {
        seenOptions.push(options);
        const wantsPng = (options as { archivalPng?: boolean }).archivalPng === true;
        return {
          buffer: mockEnhancedBuffer,
          ...(wantsPng && { archivalBuffer: pngOf(String(seenOptions.length)) }),
        };
      };
      return seenOptions;
    };

    test('writes one PNG beside each JPEG when the option is on', async () => {
      const seenOptions = enhanceWithArchival();
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({ archivalPng: true });

      await orchestrator.startFrontScan();
      await orchestrator.startBackScan();
      await orchestrator.completeBatch();

      expect(await listProcessed(tmp)).toEqual(
        [
          'unknown_001.json',
          'unknown_001_back.jpg',
          'unknown_001_back.png',
          'unknown_001_front.jpg',
          'unknown_001_front.png',
          'unknown_002.json',
          'unknown_002_back.jpg',
          'unknown_002_back.png',
          'unknown_002_front.jpg',
          'unknown_002_front.png',
        ].map((name) => join('unknown', name)),
      );
      expect(seenOptions).toHaveLength(4);
      for (const options of seenOptions) {
        expect(options).toMatchObject({ normalize: true, sharpen: true, archivalPng: true });
      }

      // Calls 1-2 are the fronts (top-left, top-right), 3-4 the backs.
      const read = (name: string) => readFile(join(tmp, 'processed', 'unknown', name));
      expect((await read('unknown_001_front.png')).equals(pngOf('1'))).toBe(true);
      expect((await read('unknown_002_front.png')).equals(pngOf('2'))).toBe(true);
      expect((await read('unknown_001_back.png')).equals(pngOf('3'))).toBe(true);
      expect((await read('unknown_002_back.png')).equals(pngOf('4'))).toBe(true);
      expect((await read('unknown_001_front.jpg')).equals(mockEnhancedBuffer)).toBe(true);
      await cleanup();
    });

    test('writes no back PNG for a front-only pair', async () => {
      enhanceWithArchival();
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({ archivalPng: true });

      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const pngs = (await listProcessed(tmp)).filter((f) => f.endsWith('.png'));
      expect(pngs).toEqual(
        ['unknown_001_front.png', 'unknown_002_front.png'].map((name) => join('unknown', name)),
      );
      await cleanup();
    });

    test('writes no PNG and does not ask the enhancer for one by default', async () => {
      const seenOptions = enhanceWithArchival();
      const { orchestrator, tmp, cleanup } = await makeOrchestrator();

      await orchestrator.startFrontScan();
      await orchestrator.startBackScan();
      await orchestrator.completeBatch();

      const files = await listProcessed(tmp);
      expect(files.filter((f) => f.endsWith('.png'))).toEqual([]);
      expect(files.filter((f) => f.endsWith('.jpg'))).toHaveLength(4);
      expect(seenOptions).toHaveLength(4);
      for (const options of seenOptions) {
        expect(options).not.toHaveProperty('archivalPng');
      }
      await cleanup();
    });

    test('the next batch continues the sequence past files that have a PNG', async () => {
      enhanceWithArchival();
      const { orchestrator, tmp, cleanup } = await makeOrchestrator({ archivalPng: true });

      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();
      await orchestrator.startFrontScan();
      await orchestrator.completeBatch();

      const pngs = (await listProcessed(tmp)).filter((f) => f.endsWith('.png'));
      expect(pngs).toEqual([1, 2, 3, 4].map((n) => join('unknown', `unknown_00${n}_front.png`)));
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

  describe('cancelScan', () => {
    test('returns false when no scan matches the scanId', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const cancelled = await orchestrator.cancelScan('not-a-real-scan-id');
      expect(cancelled).toBe(false);
      expect(cancelScanJobImpl).not.toHaveBeenCalled();
      await cleanup();
    });

    test('cancels an in-flight scan and dispatches eSCL DELETE against the job URL', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      const events = attachListeners(orchestrator);
      mockJobUrl = 'http://mock-scanner/eSCL/ScanJobs/job-42';

      // Mid-scan, cancel via the active-scans registry. Bridge performScan
      // with a deferred that resolves only when cancel kicks in.
      let resolveScan: (buf: Buffer) => void = () => undefined;
      performScanImpl = (_scanner, _options, _timeoutMs, _progressCallback) =>
        new Promise<Buffer>((resolve) => {
          resolveScan = resolve;
        });

      const scanPromise = orchestrator.startFrontScan().catch(() => undefined);
      // Allow performScan + onJobCreated to register the scanId
      await new Promise((r) => setTimeout(r, 5));
      const state = orchestrator.getState();
      expect(state.status).toBe('scanning_fronts');
      const scanId = 'scanId' in state ? state.scanId : '';
      expect(scanId).toBeTruthy();

      const cancelled = await orchestrator.cancelScan(scanId);
      expect(cancelled).toBe(true);
      expect(cancelScanJobImpl).toHaveBeenCalledWith(mockJobUrl);
      expect(orchestrator.getState().status).toBe('idle');
      expect(events.errors.find((e) => e.error.message === 'Scan cancelled by user')).toBeDefined();

      // Release the still-pending performScan so its catch doesn't leak
      resolveScan(realImageBuffer);
      await scanPromise;
      await cleanup();
    });
  });

  describe('skipBacks', () => {
    test('returns false when state is not ready_for_backs or scanning_backs', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      expect(await orchestrator.skipBacks()).toBe(false);
      expect(cancelScanJobImpl).not.toHaveBeenCalled();
      await cleanup();
    });

    test('cancels an in-flight back scan when called during scanning_backs', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      mockJobUrl = 'http://mock-scanner/eSCL/ScanJobs/back-job-7';

      // Drive to ready_for_backs first via a normal front scan
      await orchestrator.startFrontScan();
      expect(orchestrator.getState().status).toBe('ready_for_backs');

      // Now begin a back scan that hangs so skipBacks can interrupt it
      let resolveScan: (buf: Buffer) => void = () => undefined;
      performScanImpl = (_scanner, _options, _timeoutMs, _progressCallback) =>
        new Promise<Buffer>((resolve) => {
          resolveScan = resolve;
        });

      const backPromise = orchestrator.startBackScan().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 5));
      expect(orchestrator.getState().status).toBe('scanning_backs');

      const skipped = await orchestrator.skipBacks();
      expect(skipped).toBe(true);
      expect(cancelScanJobImpl).toHaveBeenCalledWith(mockJobUrl);

      // Let the hung performScan resolve so the catch path cleans up
      resolveScan(realImageBuffer);
      await backPromise;
      await cleanup();
    });

    test('returns true when called from ready_for_backs without an in-flight scan', async () => {
      const { orchestrator, cleanup } = await makeOrchestrator();
      await orchestrator.startFrontScan();
      expect(orchestrator.getState().status).toBe('ready_for_backs');

      const skipped = await orchestrator.skipBacks();
      expect(skipped).toBe(true);
      expect(cancelScanJobImpl).not.toHaveBeenCalled();
      await cleanup();
    });
  });
});
