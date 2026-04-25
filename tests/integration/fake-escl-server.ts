/**
 * Fake eSCL Server
 *
 * A small Node `http` server that mimics an eSCL-compatible scanner for
 * integration testing. Implements just enough of the protocol to let the
 * real eSCL client and ScanOrchestrator drive a complete scan workflow:
 *
 *   GET  /eSCL/ScannerCapabilities  → capabilities XML
 *   GET  /eSCL/ScannerStatus        → status XML (configurable state sequence)
 *   POST /eSCL/ScanJobs             → 201 with Location: /eSCL/ScanJobs/{id}
 *   GET  /eSCL/ScanJobs/{id}/NextDocument → real JPEG bytes (configurable failure)
 *
 * No external dependencies — only Node's `http` and `sharp` (already in deps).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';

/**
 * eSCL ScannerStatus state. The real client looks for "Processing" → "Idle"
 * transitions, so we let the test choose the sequence.
 */
export type ScannerStateValue = 'Idle' | 'Processing' | 'Down';

/**
 * Configuration for the fake server's behavior.
 */
export interface FakeScannerConfig {
  /**
   * Sequence of states to return from /eSCL/ScannerStatus.
   * Each call advances one position; the last value is held forever.
   * Default: ['Idle', 'Processing', 'Idle'] — fast path for the eSCL client's
   * waitForScanReady logic which needs Processing seen at least once
   * followed by Idle.
   */
  stateSequence: ScannerStateValue[];
  /**
   * If set, the Nth call to /eSCL/ScanJobs/{id}/NextDocument fails (1-indexed).
   * Useful for simulating mid-batch scanner errors.
   */
  failNthDocumentDownload: number | null;
  /**
   * If true, POST /eSCL/ScanJobs returns 503 instead of 201.
   */
  failJobCreation: boolean;
}

const CAPABILITIES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <pwg:MakeAndModel>Fake eSCL Scanner</pwg:MakeAndModel>
  <pwg:SerialNumber>FAKE-0001</pwg:SerialNumber>
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MinWidth>16</scan:MinWidth>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MinHeight>16</scan:MinHeight>
      <scan:MaxHeight>3300</scan:MaxHeight>
      <scan:SettingProfiles>
        <scan:SettingProfile>
          <scan:ColorModes>
            <scan:ColorMode>RGB24</scan:ColorMode>
            <scan:ColorMode>Grayscale8</scan:ColorMode>
          </scan:ColorModes>
          <scan:DocumentFormats>
            <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
            <pwg:DocumentFormat>image/png</pwg:DocumentFormat>
          </scan:DocumentFormats>
          <scan:SupportedResolutions>
            <scan:DiscreteResolutions>
              <scan:DiscreteResolution>
                <scan:XResolution>300</scan:XResolution>
                <scan:YResolution>300</scan:YResolution>
              </scan:DiscreteResolution>
              <scan:DiscreteResolution>
                <scan:XResolution>600</scan:XResolution>
                <scan:YResolution>600</scan:YResolution>
              </scan:DiscreteResolution>
            </scan:DiscreteResolutions>
          </scan:SupportedResolutions>
        </scan:SettingProfile>
      </scan:SettingProfiles>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`;

const buildStatusXml = (state: ScannerStateValue): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <pwg:State>${state}</pwg:State>
</scan:ScannerStatus>`;

/**
 * Build a 4-photo composite JPEG that the photo detector can split into
 * four distinct regions. Uses 300 DPI minimum (2 inches = 600 px) so each
 * tile is comfortably above the minimum photo size.
 */
const build4PhotoJpeg = async (): Promise<Buffer> => {
  // Total: 1800 x 1800 (6" x 6" at 300 DPI), four ~700px tiles with gaps.
  // White background, distinct colored tiles so the detector finds 4 regions.
  const tile = async (r: number, g: number, b: number): Promise<Buffer> =>
    sharp({
      create: {
        width: 700,
        height: 700,
        channels: 3,
        background: { r, g, b },
      },
    })
      .png()
      .toBuffer();

  const [tl, tr, bl, br] = await Promise.all([
    tile(220, 60, 60),
    tile(60, 180, 60),
    tile(60, 90, 220),
    tile(220, 200, 60),
  ]);

  return sharp({
    create: {
      width: 1800,
      height: 1800,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: tl, top: 50, left: 50 },
      { input: tr, top: 50, left: 1050 },
      { input: bl, top: 1050, left: 50 },
      { input: br, top: 1050, left: 1050 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
};

export interface FakeScanner {
  port: number;
  host: string;
  /**
   * Update the runtime config (state sequence, failure injection, etc.).
   * Resets internal counters so tests can reuse a server across cases.
   */
  configure(config: Partial<FakeScannerConfig>): void;
  /** Reset internal counters without changing config. */
  resetCounters(): void;
  /** Total /eSCL/ScanJobs POSTs received. */
  jobCreations(): number;
  /** Total /NextDocument GETs received. */
  documentDownloads(): number;
  stop(): Promise<void>;
}

const DEFAULT_CONFIG: FakeScannerConfig = {
  // Two-poll path: first poll sees Processing (sets sawProcessing=true),
  // second poll sees Idle and returns true. ~1s per poll = ~2s per scan.
  stateSequence: ['Processing', 'Idle'],
  failNthDocumentDownload: null,
  failJobCreation: false,
};

/**
 * Start a fake eSCL server on a random port. Returns control handles.
 */
export const startFakeScanner = async (
  initial: Partial<FakeScannerConfig> = {},
): Promise<FakeScanner> => {
  const config: FakeScannerConfig = { ...DEFAULT_CONFIG, ...initial };
  let stateCallCount = 0;
  let jobCount = 0;
  let documentCount = 0;

  const jpegPromise = build4PhotoJpeg();

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      // GET /eSCL/ScannerCapabilities
      if (method === 'GET' && url === '/eSCL/ScannerCapabilities') {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(CAPABILITIES_XML);
        return;
      }

      // GET /eSCL/ScannerStatus
      if (method === 'GET' && url === '/eSCL/ScannerStatus') {
        const idx = Math.min(stateCallCount, config.stateSequence.length - 1);
        const state = config.stateSequence[idx] ?? 'Idle';
        stateCallCount += 1;
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(buildStatusXml(state));
        return;
      }

      // POST /eSCL/ScanJobs — drain body, then reply 201 with Location.
      // Each new job restarts the status state sequence so consecutive scans
      // re-observe Processing → Idle.
      if (method === 'POST' && url === '/eSCL/ScanJobs') {
        // Drain the request body even though we don't inspect it.
        req.on('data', () => {});
        req.on('end', () => {
          if (config.failJobCreation) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('Scanner busy');
            return;
          }
          jobCount += 1;
          stateCallCount = 0;
          const jobId = `job-${jobCount}-${Date.now()}`;
          const addr = server.address() as AddressInfo;
          // Use the same host:port the client connected to so curl can resolve it.
          const host = req.headers.host ?? `127.0.0.1:${addr.port}`;
          res.writeHead(201, {
            'Content-Type': 'text/plain',
            Location: `http://${host}/eSCL/ScanJobs/${jobId}`,
          });
          res.end();
        });
        return;
      }

      // GET /eSCL/ScanJobs/{id}/NextDocument
      if (method === 'GET' && /^\/eSCL\/ScanJobs\/[^/]+\/NextDocument$/.test(url)) {
        documentCount += 1;
        if (
          config.failNthDocumentDownload !== null &&
          documentCount === config.failNthDocumentDownload
        ) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Simulated scanner failure');
          return;
        }
        const jpeg = await jpegPromise;
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(jpeg.length),
        });
        res.end(jpeg);
        return;
      }

      // DELETE on any /eSCL/ScanJobs/{id} (cancel)
      if (method === 'DELETE' && /^\/eSCL\/ScanJobs\//.test(url)) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end();
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Fake server error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;

  return {
    port,
    host: '127.0.0.1',
    configure(update) {
      Object.assign(config, update);
      stateCallCount = 0;
      documentCount = 0;
    },
    resetCounters() {
      stateCallCount = 0;
      documentCount = 0;
      jobCount = 0;
    },
    jobCreations() {
      return jobCount;
    },
    documentDownloads() {
      return documentCount;
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
};
