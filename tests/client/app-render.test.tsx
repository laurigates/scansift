/**
 * Render tests for the React client.
 *
 * These mount the real component tree in happy-dom through
 * @testing-library/react, so they exercise the installed react / react-dom
 * pair (hooks, effects, the zustand subscription) rather than only the store.
 *
 * happy-dom is registered while this module loads and unregistered in
 * afterAll, because `bun run test:unit` runs this file in the same process as
 * the server-side unit tests, which must keep Bun's own globals (fetch in
 * particular). react-dom and @testing-library/react read `window`/`document`
 * when they are first evaluated, so they are imported after registration; the
 * import has to be at module level because @testing-library/react registers
 * its own beforeAll/afterEach hooks on load.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const fetchMock = mock(
  async (_input: string | URL | Request) =>
    new Response(JSON.stringify({ available: true, model: 'Test Scanner 3000', ip: '10.0.0.7' }), {
      headers: { 'Content-Type': 'application/json' },
    }),
);

GlobalRegistrator.register({ url: 'http://localhost:3000/' });
// Installed after registration (which swaps in happy-dom's fetch) and removed
// again by unregister(), which restores Bun's fetch.
globalThis.fetch = fetchMock as unknown as typeof fetch;

const rtl = await import('@testing-library/react');
const { useScanStore } = await import('../../src/client/stores/scan-store');
const { App } = await import('../../src/client/App');

// App calls connect() on mount, which would open a real Socket.IO connection.
// Replace the action on the store instead of mocking the socket.io-client
// module, so nothing leaks into scan-store.test.ts.
const originalConnect = useScanStore.getState().connect;

beforeAll(() => {
  useScanStore.setState({ connect: () => {} });
});

afterEach(() => {
  rtl.cleanup();
  fetchMock.mockClear();
  useScanStore.setState({ state: { status: 'idle' }, socket: null, previews: [] });
});

afterAll(async () => {
  useScanStore.setState({ connect: originalConnect });
  // Renders committed outside act() (the fetch resolving inside findBy*) leave
  // React's passive-effect flush queued on the scheduler as a macrotask, and
  // that task reads `window`. Let the queue drain before the globals go away,
  // otherwise it can fire after unregister() and fail the run with
  // "ReferenceError: window is not defined".
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await GlobalRegistrator.unregister();
});

describe('client render', () => {
  test('runs on React 19', async () => {
    const react = await import('react');
    const reactDom = await import('react-dom');

    expect(react.version.startsWith('19.')).toBe(true);
    expect(reactDom.version).toBe(react.version);
  });

  test('mounts the idle app and shows the scanner status once fetched', async () => {
    const view = rtl.render(<App />);

    expect(view.getByRole('heading', { name: 'PhotoScan' })).toBeDefined();
    expect(view.getByRole('button', { name: 'Scan Fronts' })).toBeDefined();
    expect(view.getByText('Checking scanner...')).toBeDefined();

    expect(await view.findByText('Scanner Connected')).toBeDefined();
    expect(view.getByText('Test Scanner 3000')).toBeDefined();
    expect(view.getByText('10.0.0.7')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/scanner/status');
  });

  test('refetches the scanner status when Refresh is clicked', async () => {
    const view = rtl.render(<App />);
    await view.findByText('Scanner Connected');

    rtl.fireEvent.click(view.getByRole('button', { name: 'Refresh scanner status' }));

    await rtl.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await view.findByText('Refresh')).toBeDefined();
  });

  test('re-renders from store updates made outside React', async () => {
    const view = rtl.render(<App />);
    await view.findByText('Scanner Connected');

    rtl.act(() => {
      useScanStore.setState({ state: { status: 'processing_fronts', scanId: 'scan-1', progress: 40 } });
    });
    expect(view.getByText('Detecting and processing photos...')).toBeDefined();
    expect(view.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    expect(view.getByRole('button', { name: 'Scan in progress' })).toHaveProperty('disabled', true);

    rtl.act(() => {
      useScanStore.setState({ state: { status: 'complete', batchId: 'batch-1', photosSaved: 2 } });
    });
    expect(view.getByText('Batch complete!')).toBeDefined();
    expect(view.getByText('2 photos saved successfully')).toBeDefined();

    rtl.fireEvent.click(view.getByRole('button', { name: 'Start a new batch of photos' }));
    expect(view.queryByText('Batch complete!')).toBeNull();
    expect(view.getByRole('button', { name: 'Scan Fronts' })).toBeDefined();
  });

  test('renders detected photo previews while waiting for backs', async () => {
    const view = rtl.render(<App />);
    await view.findByText('Scanner Connected');

    rtl.act(() => {
      useScanStore.setState({
        state: { status: 'ready_for_backs', frontScanId: 'scan-1', photosDetected: 1 },
        previews: [
          {
            position: 'top-left',
            thumbnail: 'AAAA',
            bounds: { width: 600, height: 400 },
            confidence: 91,
          },
        ],
      });
    });

    expect(view.getByText('1 photo ready')).toBeDefined();
    expect(view.getByRole('button', { name: 'Scan Backs' })).toBeDefined();
    expect(
      view.getByRole('button', { name: 'Skip scanning backs and save with fronts only' }),
    ).toBeDefined();
    expect(view.getByText('91% confidence')).toBeDefined();
    // Only the top-left slot holds a photo; the other three render placeholders.
    expect(view.getAllByText('No photo', { selector: 'p' })).toHaveLength(3);

    rtl.fireEvent.click(view.getByRole('button', { name: 'View Top Left photo in full size' }));
    expect(view.getByRole('dialog', { name: 'Full size photo view' })).toBeDefined();

    rtl.fireEvent.click(view.getByRole('button', { name: 'Close lightbox' }));
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
