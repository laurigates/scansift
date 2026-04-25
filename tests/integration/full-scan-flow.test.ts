/**
 * End-to-end integration tests for the scan workflow.
 *
 * Boots a real Fastify instance via createApp, injects a fake eSCL HTTP
 * server in place of a real scanner, and exercises the REST routes,
 * orchestrator state machine, and Socket.IO event broadcasts.
 *
 * Production seams used:
 *   - `discoverScanners` mocked via `mock.module` to point at the fake server.
 *   - `detectPhotos` mocked to return a deterministic 4-photo layout — the
 *     real detector is not reliable on synthetic test images and is covered
 *     by its own unit tests.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { DetectedPhoto, GridPosition } from '../../src/shared/types';
import { type FakeScanner, startFakeScanner } from './fake-escl-server';

// --- Test fixtures and module mocks --------------------------------------

let fakeScanner: FakeScanner;
let outputDir: string;

// Per-detection state so individual tests can flip between "4 photos" and
// "different photo set". Default: 4 quadrants of an 1800x1800 image.
const FRONT_PHOTOS: Array<{ position: GridPosition; bounds: DetectedPhoto['bounds'] }> = [
  { position: 'top-left', bounds: { x: 50, y: 50, width: 700, height: 700 } },
  { position: 'top-right', bounds: { x: 1050, y: 50, width: 700, height: 700 } },
  { position: 'bottom-left', bounds: { x: 50, y: 1050, width: 700, height: 700 } },
  { position: 'bottom-right', bounds: { x: 1050, y: 1050, width: 700, height: 700 } },
];

const buildDetectedPhotos = (): DetectedPhoto[] =>
  FRONT_PHOTOS.map((p) => ({
    image: Buffer.alloc(0), // populated by the orchestrator's crop step
    position: p.position,
    bounds: p.bounds,
    confidence: 0.85,
  }));

// Pull the real implementations from the underlying source files (NOT the
// barrel export, to avoid the cycle where mock.module would replace what we
// re-export from). We override discoverScanners + getScannerStatus to point
// at the fake server, but keep the real eSCL client functions.
const realDiscovery = await import('../../src/server/services/scanner/discovery');
const realEsclClient = await import('../../src/server/services/scanner/escl-client');

mock.module('../../src/server/services/scanner', () => ({
  // Override scanner discovery to return the fake server.
  discoverScanners: async () => [
    {
      name: 'Fake eSCL Scanner',
      host: fakeScanner.host,
      port: fakeScanner.port,
      addresses: [fakeScanner.host],
      txt: { ty: 'Fake eSCL Scanner' },
    },
  ],
  getScannerStatus: async () => ({ state: 'Idle' }),
  // Pass-throughs for everything the orchestrator + routes need.
  getScannerCapabilities: realDiscovery.getScannerCapabilities,
  performScan: realEsclClient.performScan,
  buildScanSettings: realEsclClient.buildScanSettings,
  cancelScanJob: realEsclClient.cancelScanJob,
  createScanJob: realEsclClient.createScanJob,
  downloadDocument: realEsclClient.downloadDocument,
  getScannerBaseUrl: realEsclClient.getScannerBaseUrl,
  waitForScanReady: realEsclClient.waitForScanReady,
  VALID_RESOLUTIONS: realEsclClient.VALID_RESOLUTIONS,
}));

mock.module('../../src/server/detection/photo-detector', () => ({
  detectPhotos: async () => ({
    photos: buildDetectedPhotos(),
    processingTime: 1,
    warnings: [],
  }),
}));

// Import AFTER mock.module so the orchestrator picks up the stubs.
const { createApp } = await import('../../src/server/index');

type App = Awaited<ReturnType<typeof createApp>>;

let app: App;
let baseUrl: string;

const startApp = async (): Promise<{ app: App; baseUrl: string }> => {
  // Force the orchestrator to write into an isolated tmpdir.
  process.env.OUTPUT_DIR = outputDir;
  const instance = await createApp();
  await instance.listen({ port: 0, host: '127.0.0.1' });
  const addr = instance.server.address() as AddressInfo;
  return { app: instance, baseUrl: `http://127.0.0.1:${addr.port}` };
};

const stopApp = async (instance: App): Promise<void> => {
  // Close socket.io first to release sockets, then close Fastify.
  try {
    instance.io.close();
  } catch {
    /* ignore */
  }
  await instance.close();
};

const waitForEvent = <T>(socket: Socket, event: string, timeoutMs = 8000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for socket event: ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const post = async (path: string, body: unknown = {}): Promise<Response> =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const get = async (path: string): Promise<Response> => fetch(`${baseUrl}${path}`);

// --- Lifecycle -----------------------------------------------------------

beforeAll(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'scansift-int-'));
  fakeScanner = await startFakeScanner();
  ({ app, baseUrl } = await startApp());
});

afterAll(async () => {
  await stopApp(app);
  await fakeScanner.stop();
  await rm(outputDir, { recursive: true, force: true });
});

afterEach(async () => {
  // Reset orchestrator state between tests so each starts from idle.
  await post('/api/scan/reset');
  fakeScanner.configure({
    stateSequence: ['Processing', 'Idle'],
    failNthDocumentDownload: null,
    failJobCreation: false,
  });
});

// --- Tests ---------------------------------------------------------------

describe('full scan flow integration', () => {
  test('happy path: front + back + complete saves paired photos and broadcasts socket events', async () => {
    // Each eSCL scan takes ~2s of polling, so the full front+back+complete
    // flow is bounded at ~5-6s. Give a comfortable timeout.
    const socket = ioClient(baseUrl, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));

    try {
      // Listen for batch:complete via the scan:complete channel (orchestrator
      // re-emits batch completion as scan:complete with the batchId).
      const scanCompletePromise = waitForEvent<{ scanId: string; photos: number }>(
        socket,
        'scan:complete',
      );

      // POST /api/scan/front
      const frontRes = await post('/api/scan/front');
      expect(frontRes.status).toBe(200);
      const frontBody = (await frontRes.json()) as { success: boolean; photosDetected: number };
      expect(frontBody.success).toBe(true);
      expect(frontBody.photosDetected).toBe(4);

      // First socket event we caught is the front scan:complete
      const frontScanComplete = await scanCompletePromise;
      expect(frontScanComplete.photos).toBe(4);

      // State should be ready_for_backs
      const stateAfterFront = await (await get('/api/scan/state')).json();
      expect((stateAfterFront as { state: { status: string } }).state.status).toBe(
        'ready_for_backs',
      );

      // POST /api/scan/back
      const backRes = await post('/api/scan/back');
      expect(backRes.status).toBe(200);
      const backBody = (await backRes.json()) as { success: boolean; photosDetected: number };
      expect(backBody.success).toBe(true);
      expect(backBody.photosDetected).toBe(4);

      // POST /api/scan/complete
      const batchCompletePromise = waitForEvent<{ scanId: string; photos: number }>(
        socket,
        'scan:complete',
      );
      const completeRes = await post('/api/scan/complete');
      expect(completeRes.status).toBe(200);
      const batch = (await completeRes.json()) as {
        pairsSaved: number;
        totalPhotos: number;
        outputDirectory: string;
      };
      expect(batch.pairsSaved).toBe(4);
      expect(batch.totalPhotos).toBe(8); // 4 fronts + 4 backs
      expect(batch.outputDirectory.startsWith(outputDir)).toBe(true);

      const batchEvent = await batchCompletePromise;
      expect(batchEvent.photos).toBe(4);
    } finally {
      socket.disconnect();
    }
  }, 15000);

  test('skip-backs path: complete without scanning backs saves front-only pairs', async () => {
    // POST /api/scan/front
    const frontRes = await post('/api/scan/front');
    expect(frontRes.status).toBe(200);

    // Skip backs by going straight to complete (the UI's "skip backs" button
    // performs exactly this — POST /api/scan/complete from ready_for_backs).
    const completeRes = await post('/api/scan/complete');
    expect(completeRes.status).toBe(200);
    const batch = (await completeRes.json()) as { pairsSaved: number; totalPhotos: number };
    expect(batch.pairsSaved).toBe(4);
    expect(batch.totalPhotos).toBe(4); // fronts only
  }, 10000);

  test('scanner offline mid-batch: failed back scan transitions to recoverable error and reset returns to idle', async () => {
    // Front scan succeeds…
    const frontRes = await post('/api/scan/front');
    expect(frontRes.status).toBe(200);

    // …then make the next NextDocument download fail (the only download
    // remaining is the back scan).
    fakeScanner.configure({
      stateSequence: ['Processing', 'Idle'],
      failNthDocumentDownload: 1,
    });
    fakeScanner.resetCounters();

    const backRes = await post('/api/scan/back');
    expect(backRes.status).toBeGreaterThanOrEqual(400);
    const backBody = (await backRes.json()) as { error: string };
    expect(backBody.error).toBeDefined();

    // Orchestrator should be in recoverable error state.
    const stateAfterFail = await (await get('/api/scan/state')).json();
    const state = (stateAfterFail as { state: { status: string; recoverable?: boolean } }).state;
    expect(state.status).toBe('error');
    expect(state.recoverable).toBe(true);

    // Reset returns the orchestrator to idle.
    const resetRes = await post('/api/scan/reset');
    expect(resetRes.status).toBe(200);
    const resetBody = (await resetRes.json()) as { state: { status: string } };
    expect(resetBody.state.status).toBe('idle');
  }, 15000);

  test('duplicate POST /api/scan/front while one is in flight returns 409 on the second call', async () => {
    // Slow the fake scanner down so the first scan is still in flight when
    // the second POST arrives. Three Processing polls = ~3s delay.
    fakeScanner.configure({
      stateSequence: ['Processing', 'Processing', 'Processing', 'Idle'],
    });
    fakeScanner.resetCounters();

    const first = post('/api/scan/front');
    // Tiny delay so the first request enters scanning_fronts state before
    // the second hits the orchestrator's state guard.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await post('/api/scan/front');

    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { error: string };
    expect(secondBody.error).toBeDefined();

    // Drain the first call so afterEach reset has a clean state to reset.
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
  }, 15000);
});
