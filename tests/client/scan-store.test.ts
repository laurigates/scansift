/**
 * Tests for the client-side Zustand scan store.
 *
 * The store wires Socket.IO listeners and exposes a small action surface used
 * by React components. We mock socket.io-client so we can drive synthetic
 * events through the registered listeners without spinning up a real socket.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

type Listener = (...args: unknown[]) => void;

interface FakeSocket {
  on: (event: string, fn: Listener) => FakeSocket;
  emit: ReturnType<typeof mock>;
  disconnect: ReturnType<typeof mock>;
  connected: boolean;
  fire: (event: string, ...args: unknown[]) => void;
  listenerCount: (event: string) => number;
  listeners: Map<string, Listener[]>;
  // Stand-in for the socket.io Manager, which is where `reconnect_failed` fires.
  io: {
    on: (event: string, fn: Listener) => void;
    fire: (event: string, ...args: unknown[]) => void;
    listenerCount: (event: string) => number;
  };
}

const EMPTY_PREVIEWS = [null, null, null, null];

const makeFakeSocket = (): FakeSocket => {
  const listeners = new Map<string, Listener[]>();
  const managerListeners = new Map<string, Listener[]>();
  const fake: FakeSocket = {
    on(event, fn) {
      const arr = listeners.get(event) ?? [];
      arr.push(fn);
      listeners.set(event, arr);
      return fake;
    },
    emit: mock((_event: string, _payload?: unknown) => {}),
    disconnect: mock(() => {
      fake.connected = false;
    }),
    connected: true,
    fire(event, ...args) {
      const arr = listeners.get(event);
      if (!arr) return;
      for (const fn of arr) fn(...args);
    },
    listenerCount(event) {
      return listeners.get(event)?.length ?? 0;
    },
    listeners,
    io: {
      on(event, fn) {
        const arr = managerListeners.get(event) ?? [];
        arr.push(fn);
        managerListeners.set(event, arr);
      },
      fire(event, ...args) {
        for (const fn of managerListeners.get(event) ?? []) fn(...args);
      },
      listenerCount(event) {
        return managerListeners.get(event)?.length ?? 0;
      },
    },
  };
  return fake;
};

// Captured options from `io(opts)` so we can assert reconnection config.
let lastIoOptions: Record<string, unknown> | undefined;
let currentSocket: FakeSocket = makeFakeSocket();

mock.module('socket.io-client', () => ({
  io: (opts?: Record<string, unknown>) => {
    lastIoOptions = opts;
    return currentSocket;
  },
}));

// Imported AFTER mock.module so the store picks up the fake `io`.
const { useScanStore } = await import('../../src/client/stores/scan-store');

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Fresh fake socket per test so listeners do not bleed across tests.
  currentSocket = makeFakeSocket();
  lastIoOptions = undefined;
  // Zustand stores are module singletons; reset only the data fields so the
  // action functions on the store remain intact (replace=true would wipe them).
  useScanStore.setState({
    state: { status: 'idle' },
    socket: null,
    previews: [...EMPTY_PREVIEWS],
    scannerAvailable: null,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('useScanStore', () => {
  describe('connect', () => {
    test('creates a socket and stores it', () => {
      useScanStore.getState().connect();

      expect(useScanStore.getState().socket).toBe(currentSocket as unknown as never);
    });

    test('passes reconnection options to socket.io-client', () => {
      useScanStore.getState().connect();

      expect(lastIoOptions).toBeDefined();
      expect(lastIoOptions?.reconnection).toBe(true);
      expect(lastIoOptions?.reconnectionAttempts).toBe(5);
      expect(lastIoOptions?.reconnectionDelay).toBe(1000);
      expect(lastIoOptions?.autoConnect).toBe(true);
    });

    test('registers listeners for the events the store handles', () => {
      useScanStore.getState().connect();

      // These are the events the store actually wires up.
      expect(currentSocket.listenerCount('connect')).toBe(1);
      expect(currentSocket.listenerCount('disconnect')).toBe(1);
      expect(currentSocket.listenerCount('scan:progress')).toBe(1);
      expect(currentSocket.listenerCount('scan:complete')).toBe(1);
      expect(currentSocket.listenerCount('scan:error')).toBe(1);
      expect(currentSocket.listenerCount('photos:detected')).toBe(1);
      expect(currentSocket.listenerCount('state:changed')).toBe(1);
      expect(currentSocket.listenerCount('scanner:status')).toBe(1);
      expect(currentSocket.io.listenerCount('reconnect_failed')).toBe(1);
    });

    test('does not create a new socket when already connected', () => {
      useScanStore.getState().connect();
      const first = useScanStore.getState().socket;

      // Simulate a second call: connect() guards on existingSocket.connected.
      const replacement = makeFakeSocket();
      currentSocket = replacement;
      useScanStore.getState().connect();

      expect(useScanStore.getState().socket).toBe(first);
      expect(replacement.listenerCount('scan:progress')).toBe(0);
    });

    // Rejected spec item: the work order asked for a `batch:complete` listener.
    // The server never sends that event to clients. The orchestrator's
    // batch:complete is rebroadcast as `scan:complete` (setupOrchestratorListeners
    // in src/server/websocket/socket-handler.ts) and ServerToClientEvents has no
    // `batch:complete` member, so a listener for it could never fire.
    test('does not register a batch:complete listener (the server sends scan:complete)', () => {
      useScanStore.getState().connect();

      expect(currentSocket.listenerCount('batch:complete')).toBe(0);
    });
  });

  describe('event: state:changed', () => {
    test('adopts the server state', () => {
      useScanStore.getState().connect();

      currentSocket.fire('state:changed', {
        status: 'processing_fronts',
        scanId: 'scan-1',
        progress: 10,
      });

      expect(useScanStore.getState().state).toEqual({
        status: 'processing_fronts',
        scanId: 'scan-1',
        progress: 10,
      });
    });

    test('replaces a local optimistic state with the server state', async () => {
      useScanStore.getState().connect();
      await useScanStore.getState().startScan('front');
      expect(useScanStore.getState().state.status).toBe('scanning_fronts');

      currentSocket.fire('state:changed', { status: 'scanning_fronts', scanId: 'scan-9' });

      expect(useScanStore.getState().state).toEqual({
        status: 'scanning_fronts',
        scanId: 'scan-9',
      });
    });

    test('lets scan:progress apply once the server reports processing_fronts', async () => {
      useScanStore.getState().connect();
      await useScanStore.getState().startScan('front');

      currentSocket.fire('state:changed', {
        status: 'processing_fronts',
        scanId: 'scan-1',
        progress: 0,
      });
      currentSocket.fire('scan:progress', {
        type: 'scan:progress',
        scanId: 'scan-1',
        progress: 60,
      });

      expect(useScanStore.getState().state).toEqual({
        status: 'processing_fronts',
        scanId: 'scan-1',
        progress: 60,
      });
    });
  });

  describe('event: scanner:status', () => {
    // getInitialState() rather than getState(): beforeEach overwrites the
    // data fields, which would hide a wrong initial value.
    test('scannerAvailable is null before any status event', () => {
      expect(useScanStore.getInitialState().scannerAvailable).toBeNull();
    });

    test('records scanner availability', () => {
      useScanStore.getState().connect();

      currentSocket.fire('scanner:status', { type: 'scanner:status', available: true });
      expect(useScanStore.getState().scannerAvailable).toBe(true);

      currentSocket.fire('scanner:status', { type: 'scanner:status', available: false });
      expect(useScanStore.getState().scannerAvailable).toBe(false);
    });

    test('does not change the workflow state', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'ready_for_backs', frontScanId: 'front-1', photosDetected: 2 },
      });

      currentSocket.fire('scanner:status', { type: 'scanner:status', available: false });

      expect(useScanStore.getState().state.status).toBe('ready_for_backs');
    });
  });

  describe('disconnect', () => {
    test('disconnects the socket and clears the reference', () => {
      useScanStore.getState().connect();
      const socket = currentSocket;

      useScanStore.getState().disconnect();

      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(useScanStore.getState().socket).toBeNull();
    });

    test('is a no-op when there is no socket', () => {
      expect(() => useScanStore.getState().disconnect()).not.toThrow();
      expect(useScanStore.getState().socket).toBeNull();
    });
  });

  describe('reconnection', () => {
    // The store delegates reconnection to socket.io-client itself by passing
    // `reconnection`, `reconnectionAttempts`, and `reconnectionDelay`. There
    // is no manual retry loop in user code, so we assert configuration only.
    test('configures socket.io to retry up to 5 times with a 1s delay', () => {
      useScanStore.getState().connect();

      expect(lastIoOptions?.reconnection).toBe(true);
      expect(lastIoOptions?.reconnectionAttempts).toBe(5);
      expect(lastIoOptions?.reconnectionDelay).toBe(1000);
    });

    // socket.io-client emits `reconnect_failed` on the Manager (`socket.io`),
    // not on the socket, once reconnectionAttempts is used up.
    test('enters a non-recoverable error state after reconnection attempts are exhausted', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'processing_fronts', scanId: 'scan-1', progress: 50 },
      });

      currentSocket.io.fire('reconnect_failed');

      expect(useScanStore.getState().state).toEqual({
        status: 'error',
        message: 'Lost connection to server',
        recoverable: false,
      });
    });

    test('a plain disconnect does not enter the error state', () => {
      useScanStore.getState().connect();

      currentSocket.fire('disconnect');

      expect(useScanStore.getState().state.status).toBe('idle');
    });
  });

  describe('event: scan:progress', () => {
    test('updates progress when state is processing_fronts', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'processing_fronts', scanId: 'scan-1', progress: 0 },
      });

      currentSocket.fire('scan:progress', {
        type: 'scan:progress',
        scanId: 'scan-1',
        progress: 42,
      });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('processing_fronts');
      if (state.status === 'processing_fronts') {
        expect(state.progress).toBe(42);
      }
    });

    test('updates progress when state is processing_backs', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: {
          status: 'processing_backs',
          frontScanId: 'front-1',
          backScanId: 'back-1',
          progress: 0,
        },
      });

      currentSocket.fire('scan:progress', {
        type: 'scan:progress',
        scanId: 'back-1',
        progress: 75,
      });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('processing_backs');
      if (state.status === 'processing_backs') {
        expect(state.progress).toBe(75);
      }
    });

    test('ignores progress events when state is idle', () => {
      useScanStore.getState().connect();

      currentSocket.fire('scan:progress', {
        type: 'scan:progress',
        scanId: 'scan-x',
        progress: 50,
      });

      expect(useScanStore.getState().state.status).toBe('idle');
    });
  });

  describe('event: scan:complete', () => {
    test('advances processing_fronts to ready_for_backs', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'processing_fronts', scanId: 'front-1', progress: 100 },
      });

      currentSocket.fire('scan:complete', {
        type: 'scan:complete',
        scanId: 'front-1',
        photos: 3,
      });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('ready_for_backs');
      if (state.status === 'ready_for_backs') {
        expect(state.frontScanId).toBe('front-1');
        expect(state.photosDetected).toBe(3);
      }
    });

    test('advances processing_backs to complete', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: {
          status: 'processing_backs',
          frontScanId: 'front-1',
          backScanId: 'back-1',
          progress: 100,
        },
      });

      currentSocket.fire('scan:complete', {
        type: 'scan:complete',
        scanId: 'batch-1',
        photos: 4,
      });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('complete');
      if (state.status === 'complete') {
        expect(state.batchId).toBe('batch-1');
        expect(state.photosSaved).toBe(4);
      }
    });

    test('ignores scan:complete in unrelated states', () => {
      useScanStore.getState().connect();
      useScanStore.setState({ state: { status: 'idle' } });

      currentSocket.fire('scan:complete', {
        type: 'scan:complete',
        scanId: 'x',
        photos: 1,
      });

      expect(useScanStore.getState().state.status).toBe('idle');
    });
  });

  describe('event: scan:error', () => {
    test('transitions to error state with the message and recoverable=true', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'processing_fronts', scanId: 'scan-1', progress: 50 },
      });

      currentSocket.fire('scan:error', {
        type: 'scan:error',
        scanId: 'scan-1',
        message: 'Scanner offline',
      });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.message).toBe('Scanner offline');
        expect(state.recoverable).toBe(true);
      }
    });

    test('transitions to error state from idle', () => {
      useScanStore.getState().connect();

      currentSocket.fire('scan:error', {
        type: 'scan:error',
        scanId: 'x',
        message: 'boom',
      });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('error');
    });
  });

  describe('event: photos:detected', () => {
    const topLeft = {
      position: 'top-left' as const,
      thumbnail: 'AAAA',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      confidence: 0.95,
    };
    const bottomRight = {
      position: 'bottom-right' as const,
      thumbnail: 'BBBB',
      bounds: { x: 200, y: 300, width: 120, height: 80 },
      confidence: 0.8,
    };

    test('starts with four empty slots', () => {
      expect(useScanStore.getInitialState().previews).toEqual(EMPTY_PREVIEWS);
    });

    // Slot order: top-left, top-right, bottom-left, bottom-right.
    test('populates a 4-slot grid-indexed preview array with nulls for missing slots', () => {
      useScanStore.getState().connect();

      // Payload shape as the server sends it: { scanId, previews }, in
      // detection order rather than grid order.
      currentSocket.fire('photos:detected', {
        scanId: 'scan-1',
        previews: [bottomRight, topLeft],
      });

      expect(useScanStore.getState().previews).toEqual([topLeft, null, null, bottomRight]);
    });

    test('fills all four slots in grid order', () => {
      useScanStore.getState().connect();
      const topRight = { ...topLeft, position: 'top-right' as const, thumbnail: 'CCCC' };
      const bottomLeft = { ...topLeft, position: 'bottom-left' as const, thumbnail: 'DDDD' };

      currentSocket.fire('photos:detected', {
        scanId: 'scan-1',
        previews: [bottomLeft, bottomRight, topRight, topLeft],
      });

      expect(useScanStore.getState().previews).toEqual([
        topLeft,
        topRight,
        bottomLeft,
        bottomRight,
      ]);
    });

    test('an empty previews array yields four empty slots', () => {
      useScanStore.getState().connect();
      useScanStore.setState({ previews: [topLeft, null, null, null] });

      currentSocket.fire('photos:detected', { scanId: 'scan-1', previews: [] });

      expect(useScanStore.getState().previews).toEqual(EMPTY_PREVIEWS);
    });

    test('replaces the previous slots instead of merging into them', () => {
      useScanStore.getState().connect();
      useScanStore.setState({ previews: [topLeft, null, null, null] });

      currentSocket.fire('photos:detected', { scanId: 'scan-2', previews: [bottomRight] });

      expect(useScanStore.getState().previews).toEqual([null, null, null, bottomRight]);
    });
  });

  describe('action: startScan(front)', () => {
    test('emits scan:start with scanType=front and moves state to scanning_fronts', async () => {
      useScanStore.getState().connect();

      await useScanStore.getState().startScan('front');

      expect(currentSocket.emit).toHaveBeenCalledTimes(1);
      const [event, payload] = currentSocket.emit.mock.calls[0] ?? [];
      expect(event).toBe('scan:start');
      expect(payload).toEqual({ scanType: 'front' });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('scanning_fronts');
      if (state.status === 'scanning_fronts') {
        expect(state.scanId).toBe('pending');
      }
    });

    test('sets error state when not connected', async () => {
      // No connect() call - socket is null.
      await useScanStore.getState().startScan('front');

      const state = useScanStore.getState().state;
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.message).toMatch(/not connected/i);
        expect(state.recoverable).toBe(true);
      }
    });

    test('sets error state when socket is disconnected', async () => {
      useScanStore.getState().connect();
      currentSocket.connected = false;

      await useScanStore.getState().startScan('front');

      expect(useScanStore.getState().state.status).toBe('error');
      expect(currentSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('action: startScan(back)', () => {
    test('emits scan:start with frontScanId when state is ready_for_backs', async () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'ready_for_backs', frontScanId: 'front-1', photosDetected: 3 },
      });

      await useScanStore.getState().startScan('back');

      const [event, payload] = currentSocket.emit.mock.calls[0] ?? [];
      expect(event).toBe('scan:start');
      expect(payload).toEqual({ scanType: 'back', frontScanId: 'front-1' });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('scanning_backs');
      if (state.status === 'scanning_backs') {
        expect(state.frontScanId).toBe('front-1');
        expect(state.backScanId).toBe('pending');
      }
    });

    test('startScan("back") outside ready_for_backs is a no-op', async () => {
      useScanStore.getState().connect();
      // state remains idle.

      await expect(useScanStore.getState().startScan('back')).resolves.toBeUndefined();

      expect(currentSocket.emit).not.toHaveBeenCalled();
      expect(useScanStore.getState().state.status).toBe('idle');
    });
  });

  describe('action: skipBacks', () => {
    test('emits scan:skip-backs and transitions to saving when ready_for_backs', async () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        state: { status: 'ready_for_backs', frontScanId: 'front-1', photosDetected: 2 },
      });

      await useScanStore.getState().skipBacks();

      const [event, payload] = currentSocket.emit.mock.calls[0] ?? [];
      expect(event).toBe('scan:skip-backs');
      expect(payload).toEqual({ frontScanId: 'front-1' });

      const state = useScanStore.getState().state;
      expect(state.status).toBe('saving');
      if (state.status === 'saving') {
        expect(state.batchId).toBe('front-1');
      }
    });

    test('is a no-op when state is not ready_for_backs', async () => {
      useScanStore.getState().connect();
      useScanStore.setState({ state: { status: 'idle' } });

      await useScanStore.getState().skipBacks();

      expect(currentSocket.emit).not.toHaveBeenCalled();
      expect(useScanStore.getState().state.status).toBe('idle');
    });

    test('sets error state when not connected', async () => {
      useScanStore.setState({
        state: { status: 'ready_for_backs', frontScanId: 'front-1', photosDetected: 2 },
        socket: null,
      });

      await useScanStore.getState().skipBacks();

      expect(useScanStore.getState().state.status).toBe('error');
    });
  });

  describe('action: checkScanner', () => {
    test('returns parsed scanner status on a successful response', async () => {
      const payload = { available: true, model: 'EPSON XP-7100', ip: '192.168.1.50' };
      globalThis.fetch = mock(
        async () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch;

      const result = await useScanStore.getState().checkScanner();

      expect(result).toEqual(payload);
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe('/api/scanner/status');
    });

    test('returns { available: false } on a non-OK response', async () => {
      globalThis.fetch = mock(
        async () => new Response('error', { status: 500 }),
      ) as unknown as typeof fetch;

      const result = await useScanStore.getState().checkScanner();

      expect(result).toEqual({ available: false });
    });

    test('returns { available: false } when fetch rejects', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('network');
      }) as unknown as typeof fetch;

      const result = await useScanStore.getState().checkScanner();

      expect(result).toEqual({ available: false });
    });
  });

  describe('action: clearPreviews', () => {
    test('empties every preview slot', () => {
      useScanStore.setState({
        previews: [
          {
            position: 'top-left',
            thumbnail: 'x',
            bounds: { width: 1, height: 1 },
            confidence: 1,
          },
          null,
          null,
          null,
        ],
      });

      useScanStore.getState().clearPreviews();

      expect(useScanStore.getState().previews).toEqual(EMPTY_PREVIEWS);
    });
  });

  describe('action: reset', () => {
    test('returns the store to its initial state and clears previews', () => {
      useScanStore.setState({
        state: { status: 'error', message: 'x', recoverable: true },
        previews: [
          null,
          {
            position: 'top-right',
            thumbnail: 'y',
            bounds: { width: 1, height: 1 },
            confidence: 1,
          },
          null,
          null,
        ],
      });

      useScanStore.getState().reset();

      expect(useScanStore.getState().state).toEqual({ status: 'idle' });
      expect(useScanStore.getState().previews).toEqual(EMPTY_PREVIEWS);
    });

    test('reset does not disconnect the existing socket', () => {
      useScanStore.getState().connect();
      const socket = currentSocket;

      useScanStore.getState().reset();

      // reset() only clears state and previews; socket reference is preserved.
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(useScanStore.getState().socket).toBe(socket as unknown as never);
    });
  });
});
