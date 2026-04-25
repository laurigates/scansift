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
}

const makeFakeSocket = (): FakeSocket => {
  const listeners = new Map<string, Listener[]>();
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
  useScanStore.setState({ state: { status: 'idle' }, socket: null, previews: [] });
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

    // The work order asks for listeners for `state:changed`, `scanner:status`,
    // and `batch:complete`. The current store does not register any of these,
    // so the corresponding behavior is not testable. Marking as todo so the
    // gap is visible without modifying source code.
    test.todo('registers listener for state:changed (not implemented in store)', () => {});
    test.todo('registers listener for scanner:status (not implemented in store)', () => {});
    test.todo('registers listener for batch:complete (not implemented in store)', () => {});
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

    // The work order describes a custom retry loop and a terminal error after
    // exhaustion. The store does not implement either; track as todo.
    test.todo('enters error state after reconnection attempts are exhausted', () => {});
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
    test('replaces previews with the incoming photos array', () => {
      useScanStore.getState().connect();

      const photos = [
        {
          position: 'top-left' as const,
          thumbnail: 'data:image/jpeg;base64,AAAA',
          bounds: { width: 100, height: 100 },
          confidence: 0.95,
        },
        {
          position: 'bottom-right' as const,
          thumbnail: 'data:image/jpeg;base64,BBBB',
          bounds: { width: 120, height: 80 },
          confidence: 0.8,
        },
      ];

      currentSocket.fire('photos:detected', { photos });

      const previews = useScanStore.getState().previews;
      expect(previews).toHaveLength(2);
      expect(previews[0]?.position).toBe('top-left');
      expect(previews[1]?.position).toBe('bottom-right');
    });

    test('handles an empty photos array', () => {
      useScanStore.getState().connect();
      useScanStore.setState({
        previews: [
          {
            position: 'top-left',
            thumbnail: 'old',
            bounds: { width: 1, height: 1 },
            confidence: 1,
          },
        ],
      });

      currentSocket.fire('photos:detected', { photos: [] });

      expect(useScanStore.getState().previews).toEqual([]);
    });

    // The work order asks for a 4-slot preview array indexed by grid position
    // with missing slots null. The store currently stores the raw array as-is
    // (not slotted), so this is intentionally a todo to flag the gap.
    test.todo('populates a 4-slot grid-indexed preview array with nulls for missing slots', () => {});
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

    // Note on actual store behavior: when startScan('back') is invoked outside
    // ready_for_backs, the store still emits scan:start (with no frontScanId)
    // and does NOT update state. The work order expects a no-op or throw, so
    // strict validation here would fail. We document the gap as todo and
    // assert the actual non-throwing behavior in a separate test below.
    test.todo('startScan("back") outside ready_for_backs is a no-op or throws', () => {});

    test('startScan("back") outside ready_for_backs does not throw and does not update state', async () => {
      useScanStore.getState().connect();
      // state remains idle.

      await expect(useScanStore.getState().startScan('back')).resolves.toBeUndefined();

      // State did not transition into a scanning state.
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
    test('empties the previews array', () => {
      useScanStore.setState({
        previews: [
          {
            position: 'top-left',
            thumbnail: 'x',
            bounds: { width: 1, height: 1 },
            confidence: 1,
          },
        ],
      });

      useScanStore.getState().clearPreviews();

      expect(useScanStore.getState().previews).toEqual([]);
    });
  });

  describe('action: reset', () => {
    test('returns the store to its initial state and clears previews', () => {
      useScanStore.setState({
        state: { status: 'error', message: 'x', recoverable: true },
        previews: [
          {
            position: 'top-right',
            thumbnail: 'y',
            bounds: { width: 1, height: 1 },
            confidence: 1,
          },
        ],
      });

      useScanStore.getState().reset();

      expect(useScanStore.getState().state).toEqual({ status: 'idle' });
      expect(useScanStore.getState().previews).toEqual([]);
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
