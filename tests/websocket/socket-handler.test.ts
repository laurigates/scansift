import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { type Socket as ClientSocket, io as ioClient } from 'socket.io-client';

// Silence the production pino logger during tests (loaded transitively by the
// socket handler).
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

// Mock the scanner services so the orchestrator (and its transitive deps) do not
// reach the network when the socket handler module is loaded.
mock.module('../../src/server/services/scanner', () => ({
  discoverScanners: mock(() => Promise.resolve([])),
  getScannerStatus: mock(() => Promise.resolve(null)),
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

const { initializeSocketHandler } = await import('../../src/server/websocket/socket-handler');

// ---------------------------------------------------------------------------
// Mock orchestrator: an EventEmitter with stub methods matching the real API.
// ---------------------------------------------------------------------------

class MockOrchestrator extends EventEmitter {
  startFrontScan = mock(() =>
    Promise.resolve({
      scanId: 'front-1',
      photosDetected: 0,
      rawImagePath: '/tmp/front.jpg',
      timestamp: new Date(),
      detectedPhotos: [],
    }),
  );
  startBackScan = mock(() =>
    Promise.resolve({
      scanId: 'back-1',
      photosDetected: 0,
      rawImagePath: '/tmp/back.jpg',
      timestamp: new Date(),
      detectedPhotos: [],
    }),
  );
  completeBatch = mock(() =>
    Promise.resolve({
      batchId: 'batch-1',
      pairsSaved: 0,
      totalPhotos: 0,
      outputDirectory: '/tmp/out',
      timestamp: new Date(),
    }),
  );
  getState = mock(() => ({ status: 'idle' as const }));
  getFrontScanResult = mock(() => null as null | { detectedPhotos: unknown[] });
  isScannerReady = mock(() => Promise.resolve(true));
  reset = mock(() => undefined);
}

// ---------------------------------------------------------------------------
// Test harness: spin up a real socket.io server on a random port.
// ---------------------------------------------------------------------------

interface Harness {
  httpServer: HttpServer;
  io: SocketIOServer;
  port: number;
  orchestrator: MockOrchestrator;
}

const startServer = async (orchestrator: MockOrchestrator): Promise<Harness> => {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer);
  initializeSocketHandler(
    io as unknown as Parameters<typeof initializeSocketHandler>[0],
    orchestrator as unknown as Parameters<typeof initializeSocketHandler>[1],
  );
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = httpServer.address();
  if (typeof addr !== 'object' || addr === null) {
    throw new Error('Failed to bind socket.io test server');
  }
  return { httpServer, io, port: addr.port, orchestrator };
};

const stopServer = async (h: Harness): Promise<void> => {
  // Bun's node:http close-callback semantics don't always fire, so we don't await
  // them here. Disconnecting all sockets and closing synchronously is sufficient
  // for tearing down the test harness.
  for (const [, sock] of h.io.sockets.sockets) {
    sock.disconnect(true);
  }
  h.io.close();
  h.httpServer.close();
  // Yield once to let close handlers run.
  await new Promise((r) => setTimeout(r, 5));
};

interface BufferedClient {
  socket: ClientSocket;
  buffered: Map<string, unknown[]>;
  /** Pop the first buffered payload for an event, or wait if none arrived yet. */
  next: <T>(event: string, timeoutMs?: number) => Promise<T>;
}

/**
 * Connect a client and pre-register listeners for the post-connection events the
 * server emits so we never miss them due to listener-registration timing races.
 */
const connectClient = (port: number): Promise<BufferedClient> => {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    const buffered = new Map<string, unknown[]>();
    const waiters = new Map<string, Array<(value: unknown) => void>>();

    const captureEvents = [
      'state:changed',
      'scanner:status',
      'scan:progress',
      'scan:complete',
      'scan:error',
      'photos:detected',
    ];

    for (const ev of captureEvents) {
      socket.on(ev, (payload: unknown) => {
        const queue = buffered.get(ev) ?? [];
        const w = waiters.get(ev);
        if (w && w.length > 0) {
          const next = w.shift();
          if (next) {
            next(payload);
            waiters.set(ev, w);
            return;
          }
        }
        queue.push(payload);
        buffered.set(ev, queue);
      });
    }

    const next = <T>(event: string, timeoutMs = 1000): Promise<T> => {
      const queue = buffered.get(event);
      if (queue && queue.length > 0) {
        const value = queue.shift() as T;
        buffered.set(event, queue);
        return Promise.resolve(value);
      }
      return new Promise<T>((res, rej) => {
        const timer = setTimeout(() => {
          rej(new Error(`Timed out waiting for "${event}" after ${timeoutMs}ms`));
        }, timeoutMs);
        const list = waiters.get(event) ?? [];
        list.push((payload) => {
          clearTimeout(timer);
          res(payload as T);
        });
        waiters.set(event, list);
      });
    };

    socket.once('connect', () => resolve({ socket, buffered, next }));
    socket.once('connect_error', (err) => reject(err));
  });
};

const waitFor = async (predicate: () => boolean, timeoutMs = 1000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitFor: predicate never became true');
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('socket handler', () => {
  let harness: Harness;
  let clients: BufferedClient[];

  beforeEach(async () => {
    clients = [];
    harness = await startServer(new MockOrchestrator());
  });

  afterEach(async () => {
    for (const c of clients) {
      if (c.socket.connected) c.socket.disconnect();
    }
    await stopServer(harness);
  });

  describe('on connection', () => {
    test('emits scanner:status to the connecting client', async () => {
      const client = await connectClient(harness.port);
      clients.push(client);

      const status = await client.next<{ type: string; available: boolean }>('scanner:status');

      expect(status.type).toBe('scanner:status');
      expect(status.available).toBe(true);
      expect(harness.orchestrator.isScannerReady).toHaveBeenCalled();
    });

    test('emits state:changed with current state to the connecting client', async () => {
      harness.orchestrator.getState.mockImplementation(() => ({
        status: 'ready_for_backs' as const,
        frontScanId: 'fs-1',
        photosDetected: 4,
      }));

      const client = await connectClient(harness.port);
      clients.push(client);

      const state = await client.next<{ status: string; photosDetected?: number }>('state:changed');

      expect(state.status).toBe('ready_for_backs');
      expect(state.photosDetected).toBe(4);
    });

    test('emits scanner:status with available=false when isScannerReady throws', async () => {
      harness.orchestrator.isScannerReady.mockImplementation(() =>
        Promise.reject(new Error('boom')),
      );

      const client = await connectClient(harness.port);
      clients.push(client);

      const status = await client.next<{ available: boolean }>('scanner:status');
      expect(status.available).toBe(false);
    });
  });

  describe('client → server events', () => {
    test('scan:start with scanType=front invokes orchestrator.startFrontScan', async () => {
      const client = await connectClient(harness.port);
      clients.push(client);

      // Drain initial events.
      await client.next('state:changed');

      client.socket.emit('scan:start', { scanType: 'front' });

      await waitFor(() => harness.orchestrator.startFrontScan.mock.calls.length > 0);
      expect(harness.orchestrator.startFrontScan).toHaveBeenCalledTimes(1);
      expect(harness.orchestrator.startBackScan).not.toHaveBeenCalled();
    });

    test('scan:start with scanType=back invokes orchestrator.startBackScan', async () => {
      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      client.socket.emit('scan:start', { scanType: 'back' });

      await waitFor(() => harness.orchestrator.startBackScan.mock.calls.length > 0);
      expect(harness.orchestrator.startBackScan).toHaveBeenCalledTimes(1);
      expect(harness.orchestrator.startFrontScan).not.toHaveBeenCalled();
    });

    test('scan:start swallows orchestrator errors (error event comes via orchestrator)', async () => {
      harness.orchestrator.startFrontScan.mockImplementation(() =>
        Promise.reject(new Error('boom')),
      );

      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      client.socket.emit('scan:start', { scanType: 'front' });

      // The handler must not crash the connection.
      await waitFor(() => harness.orchestrator.startFrontScan.mock.calls.length > 0);
      expect(client.socket.connected).toBe(true);
    });

    test.todo(
      'scan:cancel currently logs only — actual cancellation is unimplemented (TODO in handler)',
    );
  });

  describe('orchestrator → all clients broadcasts', () => {
    test('state:changed is broadcast to all connected clients', async () => {
      const c1 = await connectClient(harness.port);
      const c2 = await connectClient(harness.port);
      clients.push(c1, c2);

      // Drain initial state:changed for both clients.
      await c1.next('state:changed');
      await c2.next('state:changed');

      const newState = {
        status: 'scanning_fronts' as const,
        scanId: 'sid-1',
      };

      harness.orchestrator.emit('state:changed', newState);

      const [s1, s2] = await Promise.all([
        c1.next<typeof newState>('state:changed'),
        c2.next<typeof newState>('state:changed'),
      ]);
      expect(s1.status).toBe('scanning_fronts');
      expect(s2.status).toBe('scanning_fronts');
    });

    test('scan:progress is broadcast with scanId + progress', async () => {
      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      harness.orchestrator.emit('scan:progress', 'scan-xyz', 42);

      const data = await client.next<{ type: string; scanId: string; progress: number }>(
        'scan:progress',
      );
      expect(data.type).toBe('scan:progress');
      expect(data.scanId).toBe('scan-xyz');
      expect(data.progress).toBe(42);
    });

    test('scan:error is broadcast with sanitized error message', async () => {
      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      harness.orchestrator.emit('scan:error', 'scan-err', new Error('Something failed'));

      const data = await client.next<{ type: string; scanId: string; message: string }>(
        'scan:error',
      );
      expect(data.type).toBe('scan:error');
      expect(data.scanId).toBe('scan-err');
      expect(data.message).toBe('Something failed');
    });

    test('scan:complete is broadcast and triggers photos:detected with previews', async () => {
      const sharp = (await import('sharp')).default;
      const jpeg = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      harness.orchestrator.getFrontScanResult.mockImplementation(() => ({
        detectedPhotos: [
          {
            image: jpeg,
            position: 'top-left',
            bounds: { x: 0, y: 0, width: 50, height: 50 },
            confidence: 0.9,
          },
        ],
      }));

      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      harness.orchestrator.emit('scan:complete', 'scan-1', 1);

      const complete = await client.next<{ type: string; scanId: string; photos: number }>(
        'scan:complete',
      );
      expect(complete.scanId).toBe('scan-1');
      expect(complete.photos).toBe(1);

      const photos = await client.next<{
        scanId: string;
        previews: Array<{ position: string; thumbnail: string }>;
      }>('photos:detected', 2000);
      expect(photos.scanId).toBe('scan-1');
      expect(photos.previews).toHaveLength(1);
      expect(photos.previews[0]?.position).toBe('top-left');
      expect(photos.previews[0]?.thumbnail.length).toBeGreaterThan(0);
    });

    test('scan:complete without front scan results does not emit photos:detected', async () => {
      harness.orchestrator.getFrontScanResult.mockImplementation(() => null);

      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      harness.orchestrator.emit('scan:complete', 'scan-empty', 0);
      await client.next<{ scanId: string }>('scan:complete');

      // Give a small window to ensure photos:detected does NOT fire.
      await new Promise((r) => setTimeout(r, 50));
      expect(client.buffered.get('photos:detected') ?? []).toHaveLength(0);
    });

    test('batch:complete is broadcast as scan:complete with batch info', async () => {
      const client = await connectClient(harness.port);
      clients.push(client);
      await client.next('state:changed');

      harness.orchestrator.emit('batch:complete', {
        batchId: 'batch-7',
        pairsSaved: 3,
        totalPhotos: 6,
        outputDirectory: '/tmp/out',
        timestamp: new Date(),
      });

      const data = await client.next<{ type: string; scanId: string; photos: number }>(
        'scan:complete',
      );
      expect(data.scanId).toBe('batch-7');
      expect(data.photos).toBe(3);
    });
  });

  describe('multi-client', () => {
    test('two clients both receive scan:progress broadcasts', async () => {
      const c1 = await connectClient(harness.port);
      const c2 = await connectClient(harness.port);
      clients.push(c1, c2);
      await c1.next('state:changed');
      await c2.next('state:changed');

      harness.orchestrator.emit('scan:progress', 'sid', 75);

      const [d1, d2] = await Promise.all([
        c1.next<{ progress: number }>('scan:progress'),
        c2.next<{ progress: number }>('scan:progress'),
      ]);
      expect(d1.progress).toBe(75);
      expect(d2.progress).toBe(75);
    });
  });
});
