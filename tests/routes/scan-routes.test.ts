import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  AppError,
  DetectionError,
  ProcessingError,
  ScannerError,
  StorageError,
} from '../../src/server/errors';

// Silence pino transitively loaded by the orchestrator/route modules.
const noopLog = mock(() => undefined);
mock.module('../../src/server/logger', () => ({
  logger: {
    info: noopLog,
    warn: noopLog,
    error: noopLog,
    debug: noopLog,
    trace: noopLog,
    fatal: noopLog,
    child: () => ({
      info: noopLog,
      warn: noopLog,
      error: noopLog,
      debug: noopLog,
      trace: noopLog,
      fatal: noopLog,
    }),
  },
}));

// Mock the scanner services so route handlers do not perform real mDNS lookups.
const discoverScannersMock = mock(() => Promise.resolve([] as unknown[]));
const getScannerStatusMock = mock(() => Promise.resolve(null as unknown));

mock.module('../../src/server/services/scanner', () => ({
  discoverScanners: discoverScannersMock,
  getScannerStatus: getScannerStatusMock,
  // Stubbed exports required by transitive importers (e.g. scan-orchestrator).
  getScannerCapabilities: mock(() => Promise.resolve(null)),
  performScan: mock(() => Promise.resolve(Buffer.from(''))),
  buildScanSettings: mock(() => ''),
  cancelScanJob: mock(() => Promise.resolve(undefined)),
  createScanJob: mock(() => Promise.resolve({ success: false, error: 'mocked' })),
  downloadDocument: mock(() => Promise.resolve(Buffer.from(''))),
  getScannerBaseUrl: mock(() => 'http://mock'),
  waitForScanReady: mock(() => Promise.resolve(true)),
  VALID_RESOLUTIONS: [100, 150, 200, 300, 600, 1200] as const,
}));

const { registerScanRoutes } = await import('../../src/server/routes/scan-routes');

interface MockOrchestrator {
  startFrontScan: ReturnType<typeof mock>;
  startBackScan: ReturnType<typeof mock>;
  completeBatch: ReturnType<typeof mock>;
  reset: ReturnType<typeof mock>;
  getState: ReturnType<typeof mock>;
  getFrontScanResult: ReturnType<typeof mock>;
  isScannerReady: ReturnType<typeof mock>;
}

const createMockOrchestrator = (): MockOrchestrator => ({
  startFrontScan: mock(() =>
    Promise.resolve({
      scanId: 'scan-front-1',
      photosDetected: 2,
      rawImagePath: '/tmp/raw/front.jpg',
      timestamp: new Date('2026-04-25T12:00:00Z'),
      detectedPhotos: [],
    }),
  ),
  startBackScan: mock(() =>
    Promise.resolve({
      scanId: 'scan-back-1',
      photosDetected: 2,
      rawImagePath: '/tmp/raw/back.jpg',
      timestamp: new Date('2026-04-25T12:01:00Z'),
      detectedPhotos: [],
    }),
  ),
  completeBatch: mock(() =>
    Promise.resolve({
      batchId: 'batch-1',
      pairsSaved: 2,
      totalPhotos: 4,
      outputDirectory: '/tmp/scanned-photos/batch-1',
      timestamp: new Date('2026-04-25T12:02:00Z'),
    }),
  ),
  reset: mock(() => undefined),
  getState: mock(() => ({ status: 'idle' as const })),
  getFrontScanResult: mock(() => null),
  isScannerReady: mock(() => Promise.resolve(true)),
});

interface TestApp {
  app: FastifyInstance;
  baseUrl: string;
}

const buildApp = async (orchestrator: MockOrchestrator): Promise<TestApp> => {
  const app = Fastify({ logger: false });
  app.decorate('scanOrchestrator', orchestrator as unknown as never);
  await registerScanRoutes(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (typeof addr !== 'object' || addr === null) {
    throw new Error('Failed to bind test server');
  }
  return { app, baseUrl: `http://127.0.0.1:${addr.port}` };
};

interface RequestOptions {
  method?: string;
  body?: unknown;
}

const request = async (
  baseUrl: string,
  url: string,
  options: RequestOptions = {},
): Promise<{ status: number; json: () => Promise<unknown> }> => {
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(options.body);
  } else if (init.method !== 'GET') {
    // Fastify 4 requires a content-type for empty POST bodies in some cases; send empty JSON.
    init.headers = { 'content-type': 'application/json' };
    init.body = '{}';
  }
  const res = await fetch(`${baseUrl}${url}`, init);
  return {
    status: res.status,
    json: () => res.json(),
  };
};

describe('scan routes', () => {
  let testApp: TestApp;
  let orch: MockOrchestrator;

  beforeEach(async () => {
    discoverScannersMock.mockReset();
    getScannerStatusMock.mockReset();
    discoverScannersMock.mockImplementation(() => Promise.resolve([]));
    getScannerStatusMock.mockImplementation(() => Promise.resolve(null));
    orch = createMockOrchestrator();
    testApp = await buildApp(orch);
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  describe('GET /api/scanner/discover', () => {
    test('returns 404 when no scanners are found', async () => {
      discoverScannersMock.mockImplementation(() => Promise.resolve([]));

      const res = await request(testApp.baseUrl, '/api/scanner/discover');

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('No scanners found');
    });

    test('returns 200 with scanner list when scanners are discovered', async () => {
      discoverScannersMock.mockImplementation(() =>
        Promise.resolve([
          {
            name: 'Test Scanner',
            host: 'scanner.local',
            port: 8080,
            addresses: ['192.168.1.10'],
            txt: { ty: 'Acme MFP-1', MakeAndModel: 'Acme MFP-1' },
          },
        ]),
      );

      const res = await request(testApp.baseUrl, '/api/scanner/discover');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        scanners: Array<{ name: string; host: string; port: number; model?: string }>;
      };
      expect(body.count).toBe(1);
      expect(body.scanners[0]?.name).toBe('Test Scanner');
      expect(body.scanners[0]?.model).toBe('Acme MFP-1');
    });

    test('returns 500 when discovery throws', async () => {
      discoverScannersMock.mockImplementation(() => Promise.reject(new Error('boom')));

      const res = await request(testApp.baseUrl, '/api/scanner/discover');

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('Discovery failed');
      expect(body.message).toBe('boom');
    });
  });

  describe('GET /api/scanner/status', () => {
    test('returns available=false when scanner is not ready', async () => {
      orch.isScannerReady.mockImplementation(() => Promise.resolve(false));

      const res = await request(testApp.baseUrl, '/api/scanner/status');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { available: boolean; message: string };
      expect(body.available).toBe(false);
      expect(body.message).toBe('No scanner available');
    });

    test('returns available=false when discovery returns empty after ready check', async () => {
      orch.isScannerReady.mockImplementation(() => Promise.resolve(true));
      discoverScannersMock.mockImplementation(() => Promise.resolve([]));

      const res = await request(testApp.baseUrl, '/api/scanner/status');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { available: boolean };
      expect(body.available).toBe(false);
    });

    test('returns full scanner status when available', async () => {
      orch.isScannerReady.mockImplementation(() => Promise.resolve(true));
      discoverScannersMock.mockImplementation(() =>
        Promise.resolve([
          {
            name: 'My Scanner',
            host: 'scanner.local',
            port: 80,
            addresses: ['192.168.1.20'],
            txt: { ty: 'Acme 2000' },
          },
        ]),
      );
      getScannerStatusMock.mockImplementation(() =>
        Promise.resolve({ state: 'Idle', adfState: 'Empty' }),
      );

      const res = await request(testApp.baseUrl, '/api/scanner/status');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        available: boolean;
        scanner: { name: string; model?: string };
        state: string;
        adfState?: string;
      };
      expect(body.available).toBe(true);
      expect(body.scanner.name).toBe('My Scanner');
      expect(body.scanner.model).toBe('Acme 2000');
      expect(body.state).toBe('Idle');
      expect(body.adfState).toBe('Empty');
    });

    test('returns 500 when isScannerReady throws unexpectedly', async () => {
      orch.isScannerReady.mockImplementation(() => Promise.reject(new Error('readiness boom')));

      const res = await request(testApp.baseUrl, '/api/scanner/status');

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Status check failed');
    });
  });

  describe('POST /api/scan/front', () => {
    test('returns 200 with scan result on success (empty body)', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        scanId: string;
        photosDetected: number;
      };
      expect(body.success).toBe(true);
      expect(body.scanId).toBe('scan-front-1');
      expect(body.photosDetected).toBe(2);
      expect(orch.startFrontScan).toHaveBeenCalledTimes(1);
      // Empty body → resolution undefined → no options passed
      expect(orch.startFrontScan).toHaveBeenCalledWith(undefined);
    });

    test('passes resolution=600 to orchestrator when provided', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/front', {
        method: 'POST',
        body: { resolution: 600 },
      });

      expect(res.status).toBe(200);
      expect(orch.startFrontScan).toHaveBeenCalledWith({
        resolution: 600,
        colorMode: 'RGB24',
        format: 'image/jpeg',
      });
    });

    test('accepts resolution=300 as valid', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/front', {
        method: 'POST',
        body: { resolution: 300 },
      });

      expect(res.status).toBe(200);
      expect(orch.startFrontScan).toHaveBeenCalledWith({
        resolution: 300,
        colorMode: 'RGB24',
        format: 'image/jpeg',
      });
    });

    test('returns 400 for invalid resolution', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/front', {
        method: 'POST',
        body: { resolution: 1200 },
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; details: unknown };
      expect(body.error).toBe('Invalid request');
      expect(body.details).toBeDefined();
      expect(orch.startFrontScan).not.toHaveBeenCalled();
    });

    test('maps ScannerError → 404', async () => {
      orch.startFrontScan.mockImplementation(() =>
        Promise.reject(new ScannerError('No scanner found on network')),
      );

      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.message).toBe('No scanner found on network');
    });

    test('maps DetectionError → 422', async () => {
      orch.startFrontScan.mockImplementation(() =>
        Promise.reject(new DetectionError('No photos detected', 0)),
      );

      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(422);
    });

    test('maps ProcessingError → 500', async () => {
      orch.startFrontScan.mockImplementation(() =>
        Promise.reject(new ProcessingError('Failed to enhance photo')),
      );

      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(500);
    });

    test('maps StorageError → 500', async () => {
      orch.startFrontScan.mockImplementation(() => Promise.reject(new StorageError('Disk full')));

      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(500);
    });

    test('maps state-violation error ("Cannot start") → 409', async () => {
      orch.startFrontScan.mockImplementation(() =>
        Promise.reject(new Error('Cannot start front scan from state: scanning_fronts')),
      );

      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(409);
    });

    test('unknown AppError code falls through to 500', async () => {
      class WeirdError extends AppError {
        constructor() {
          super('weird', 'WEIRD_CODE', false);
        }
      }
      orch.startFrontScan.mockImplementation(() => Promise.reject(new WeirdError()));

      const res = await request(testApp.baseUrl, '/api/scan/front', { method: 'POST' });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/scan/back', () => {
    test('returns 200 with scan result on success', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/back', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; scanId: string };
      expect(body.success).toBe(true);
      expect(body.scanId).toBe('scan-back-1');
      expect(orch.startBackScan).toHaveBeenCalledTimes(1);
    });

    test('returns 400 for invalid resolution', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/back', {
        method: 'POST',
        body: { resolution: 'high' },
      });

      expect(res.status).toBe(400);
      expect(orch.startBackScan).not.toHaveBeenCalled();
    });

    test('maps state-violation error ("Must complete") → 409', async () => {
      orch.startBackScan.mockImplementation(() =>
        Promise.reject(
          new Error('Cannot start back scan from state: idle. Must complete front scan first.'),
        ),
      );

      const res = await request(testApp.baseUrl, '/api/scan/back', { method: 'POST' });

      expect(res.status).toBe(409);
    });

    test('maps "No front scan" error → 409', async () => {
      orch.startBackScan.mockImplementation(() =>
        Promise.reject(new Error('No front scan result available')),
      );

      const res = await request(testApp.baseUrl, '/api/scan/back', { method: 'POST' });

      expect(res.status).toBe(409);
    });

    test('maps ScannerError → 404', async () => {
      orch.startBackScan.mockImplementation(() =>
        Promise.reject(new ScannerError('No scanner available')),
      );

      const res = await request(testApp.baseUrl, '/api/scan/back', { method: 'POST' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/scan/complete', () => {
    test('returns 200 with batch result on success', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/complete', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        batchId: string;
        pairsSaved: number;
        totalPhotos: number;
        outputDirectory: string;
      };
      expect(body.success).toBe(true);
      expect(body.batchId).toBe('batch-1');
      expect(body.pairsSaved).toBe(2);
      expect(body.totalPhotos).toBe(4);
      expect(orch.completeBatch).toHaveBeenCalledTimes(1);
    });

    test('maps StorageError → 500', async () => {
      orch.completeBatch.mockImplementation(() => Promise.reject(new StorageError('Cannot write')));

      const res = await request(testApp.baseUrl, '/api/scan/complete', { method: 'POST' });

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Batch completion failed');
    });

    test('maps "No front scan" error → 409', async () => {
      orch.completeBatch.mockImplementation(() =>
        Promise.reject(new Error('No front scan result available to complete batch')),
      );

      const res = await request(testApp.baseUrl, '/api/scan/complete', { method: 'POST' });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/scan/reset', () => {
    test('returns 200 and calls orchestrator.reset', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/reset', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; state: { status: string } };
      expect(body.success).toBe(true);
      expect(body.state.status).toBe('idle');
      expect(orch.reset).toHaveBeenCalledTimes(1);
    });

    test('returns 500 if reset throws', async () => {
      orch.reset.mockImplementation(() => {
        throw new Error('reset failed');
      });

      const res = await request(testApp.baseUrl, '/api/scan/reset', { method: 'POST' });

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Reset failed');
    });
  });

  describe('GET /api/scan/state', () => {
    test('returns the orchestrator state', async () => {
      orch.getState.mockImplementation(() => ({
        status: 'ready_for_backs' as const,
        frontScanId: 'abc',
        photosDetected: 3,
      }));

      const res = await request(testApp.baseUrl, '/api/scan/state');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { state: { status: string; photosDetected: number } };
      expect(body.state.status).toBe('ready_for_backs');
      expect(body.state.photosDetected).toBe(3);
    });

    test('returns 500 if getState throws', async () => {
      orch.getState.mockImplementation(() => {
        throw new Error('state explosion');
      });

      const res = await request(testApp.baseUrl, '/api/scan/state');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/scan/previews', () => {
    test('returns empty array when no front scan exists', async () => {
      orch.getFrontScanResult.mockImplementation(() => null);

      const res = await request(testApp.baseUrl, '/api/scan/previews');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { previews: unknown[] };
      expect(body.previews).toEqual([]);
    });

    test('returns previews when scan has detected photos', async () => {
      const sharp = (await import('sharp')).default;
      const jpegBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      orch.getFrontScanResult.mockImplementation(() => ({
        scanId: 'scan-1',
        photosDetected: 1,
        rawImagePath: '/tmp/raw.jpg',
        timestamp: new Date(),
        detectedPhotos: [
          {
            image: jpegBuffer,
            position: 'top-left' as const,
            bounds: { x: 0, y: 0, width: 100, height: 100 },
            confidence: 0.9,
          },
        ],
      }));

      const res = await request(testApp.baseUrl, '/api/scan/previews');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        previews: Array<{ position: string; thumbnail: string; confidence: number }>;
      };
      expect(body.previews).toHaveLength(1);
      expect(body.previews[0]?.position).toBe('top-left');
      expect(typeof body.previews[0]?.thumbnail).toBe('string');
      expect(body.previews[0]?.thumbnail.length).toBeGreaterThan(0);
    });

    test('returns 500 when preview generation throws', async () => {
      orch.getFrontScanResult.mockImplementation(() => ({
        scanId: 'scan-1',
        photosDetected: 1,
        rawImagePath: '/tmp/raw.jpg',
        timestamp: new Date(),
        detectedPhotos: [
          {
            image: Buffer.from('not-a-real-image'),
            position: 'top-left' as const,
            bounds: { x: 0, y: 0, width: 10, height: 10 },
            confidence: 0.5,
          },
        ],
      }));

      const res = await request(testApp.baseUrl, '/api/scan/previews');

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Failed to get previews');
    });
  });

  describe('GET /api/scan/preview/:position', () => {
    test('returns 400 for invalid position', async () => {
      const res = await request(testApp.baseUrl, '/api/scan/preview/middle');

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid position');
    });

    test('returns 404 when no front scan exists', async () => {
      orch.getFrontScanResult.mockImplementation(() => null);

      const res = await request(testApp.baseUrl, '/api/scan/preview/top-left');

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('No scan results');
    });

    test('returns 404 when no photo at requested position', async () => {
      orch.getFrontScanResult.mockImplementation(() => ({
        scanId: 'scan-1',
        photosDetected: 1,
        rawImagePath: '/tmp/raw.jpg',
        timestamp: new Date(),
        detectedPhotos: [
          {
            image: Buffer.from('img'),
            position: 'top-left' as const,
            bounds: { x: 0, y: 0, width: 10, height: 10 },
            confidence: 0.9,
          },
        ],
      }));

      const res = await request(testApp.baseUrl, '/api/scan/preview/bottom-right');

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Photo not found');
    });

    test('returns base64 image and bounds for valid position', async () => {
      const buf = Buffer.from('fake-image-bytes');
      orch.getFrontScanResult.mockImplementation(() => ({
        scanId: 'scan-1',
        photosDetected: 1,
        rawImagePath: '/tmp/raw.jpg',
        timestamp: new Date(),
        detectedPhotos: [
          {
            image: buf,
            position: 'top-right' as const,
            bounds: { x: 1, y: 2, width: 3, height: 4 },
            confidence: 0.77,
          },
        ],
      }));

      const res = await request(testApp.baseUrl, '/api/scan/preview/top-right');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        position: string;
        image: string;
        bounds: { x: number; y: number; width: number; height: number };
        confidence: number;
      };
      expect(body.position).toBe('top-right');
      expect(body.image).toBe(buf.toString('base64'));
      expect(body.bounds).toEqual({ x: 1, y: 2, width: 3, height: 4 });
      expect(body.confidence).toBe(0.77);
    });

    test('returns 500 if getFrontScanResult throws', async () => {
      orch.getFrontScanResult.mockImplementation(() => {
        throw new Error('explode');
      });

      const res = await request(testApp.baseUrl, '/api/scan/preview/top-left');

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Failed to get preview');
    });
  });
});
