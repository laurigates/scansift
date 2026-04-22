/**
 * Tests for eSCL client functionality.
 * Tests the protocol logic without requiring actual scanner hardware.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DiscoveredScanner } from '../../src/server/services/scanner/discovery';
import {
  buildScanSettings,
  cancelScanJob,
  createScanJob,
  getScannerBaseUrl,
  VALID_RESOLUTIONS,
  type ValidResolution,
  waitForScanReady,
} from '../../src/server/services/scanner/escl-client';

// Mock scanner for testing
const mockScanner: DiscoveredScanner = {
  name: 'Test Scanner',
  host: 'test-scanner.local',
  port: 443,
  addresses: ['192.168.1.100'],
};

const mockScannerHttp: DiscoveredScanner = {
  name: 'Test Scanner HTTP',
  host: 'test-scanner.local',
  port: 80,
  addresses: ['192.168.1.101'],
};

describe('eSCL Client', () => {
  describe('getScannerBaseUrl', () => {
    test('returns HTTPS URL for port 443', () => {
      const url = getScannerBaseUrl(mockScanner);
      expect(url).toBe('https://192.168.1.100:443');
    });

    test('returns HTTP URL for port 80', () => {
      const url = getScannerBaseUrl(mockScannerHttp);
      expect(url).toBe('http://192.168.1.101:80');
    });

    test('uses host when addresses array is empty', () => {
      const scanner: DiscoveredScanner = {
        name: 'Test',
        host: 'scanner.local',
        port: 80,
        addresses: [],
      };
      const url = getScannerBaseUrl(scanner);
      expect(url).toBe('http://scanner.local:80');
    });

    test('uses first address from addresses array', () => {
      const scanner: DiscoveredScanner = {
        name: 'Test',
        host: 'scanner.local',
        port: 80,
        addresses: ['10.0.0.1', '10.0.0.2'],
      };
      const url = getScannerBaseUrl(scanner);
      expect(url).toBe('http://10.0.0.1:80');
    });
  });

  describe('buildScanSettings', () => {
    test('creates valid XML with default values', () => {
      const xml = buildScanSettings({});

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<scan:ScanSettings');
      expect(xml).toContain('<pwg:Version>2.63</pwg:Version>');
      expect(xml).toContain('<scan:Intent>Photo</scan:Intent>');
      expect(xml).toContain('<scan:XResolution>300</scan:XResolution>');
      expect(xml).toContain('<scan:YResolution>300</scan:YResolution>');
      expect(xml).toContain('<scan:ColorMode>RGB24</scan:ColorMode>');
      expect(xml).toContain('<scan:InputSource>Platen</scan:InputSource>');
      expect(xml).toContain('<scan:ColorSpace>sRGB</scan:ColorSpace>');
    });

    test('creates XML with custom resolution', () => {
      const xml = buildScanSettings({ resolution: 600 });

      expect(xml).toContain('<scan:XResolution>600</scan:XResolution>');
      expect(xml).toContain('<scan:YResolution>600</scan:YResolution>');
    });

    test('creates XML with custom color mode', () => {
      const xml = buildScanSettings({ colorMode: 'Grayscale8' });

      expect(xml).toContain('<scan:ColorMode>Grayscale8</scan:ColorMode>');
    });

    test('creates XML with custom format', () => {
      const xml = buildScanSettings({ format: 'image/png' });

      expect(xml).toContain('<scan:DocumentFormatExt>image/png</scan:DocumentFormatExt>');
    });

    test('creates XML with all custom options', () => {
      const xml = buildScanSettings({
        resolution: 1200,
        colorMode: 'Grayscale16',
        format: 'application/pdf',
      });

      expect(xml).toContain('<scan:XResolution>1200</scan:XResolution>');
      expect(xml).toContain('<scan:ColorMode>Grayscale16</scan:ColorMode>');
      expect(xml).toContain('<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>');
    });

    test.each(VALID_RESOLUTIONS)('supports resolution %i DPI', (resolution: ValidResolution) => {
      const xml = buildScanSettings({ resolution });

      expect(xml).toContain(`<scan:XResolution>${resolution}</scan:XResolution>`);
      expect(xml).toContain(`<scan:YResolution>${resolution}</scan:YResolution>`);
    });
  });

  describe('VALID_RESOLUTIONS', () => {
    test('includes standard scanner resolutions', () => {
      expect(VALID_RESOLUTIONS).toContain(100);
      expect(VALID_RESOLUTIONS).toContain(150);
      expect(VALID_RESOLUTIONS).toContain(200);
      expect(VALID_RESOLUTIONS).toContain(300);
      expect(VALID_RESOLUTIONS).toContain(600);
      expect(VALID_RESOLUTIONS).toContain(1200);
    });

    test('has exactly 6 valid resolutions', () => {
      expect(VALID_RESOLUTIONS.length).toBe(6);
    });

    test('resolutions are sorted ascending', () => {
      const sorted = [...VALID_RESOLUTIONS].sort((a, b) => a - b);
      expect(VALID_RESOLUTIONS).toEqual(sorted);
    });
  });

  describe('waitForScanReady', () => {
    const originalFetch = globalThis.fetch;
    const originalDateNow = Date.now;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      Date.now = originalDateNow;
    });

    test('returns true when scanner transitions from Processing to Idle', async () => {
      let callCount = 0;

      globalThis.fetch = mock(() => {
        callCount++;
        const state = callCount <= 2 ? 'Processing' : 'Idle';
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`<ScannerStatus><pwg:State>${state}</pwg:State></ScannerStatus>`),
        } as Response);
      });

      const result = await waitForScanReady(mockScannerHttp, 30000);

      expect(result).toBe(true);
    });

    test('returns true after processingCount reaches 5', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve('<ScannerStatus><pwg:State>Processing</pwg:State></ScannerStatus>'),
        } as Response),
      );

      const result = await waitForScanReady(mockScannerHttp, 30000);

      expect(result).toBe(true);
    });

    test('returns false on timeout when scanner never becomes ready', async () => {
      // Simulate time advancing past the timeout
      let now = 0;
      Date.now = mock(() => {
        const current = now;
        now += 20000; // Jump 20s each call so we exceed timeout quickly
        return current;
      });

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<ScannerStatus><pwg:State>Idle</pwg:State></ScannerStatus>'),
        } as Response),
      );

      const result = await waitForScanReady(mockScannerHttp, 1000);

      expect(result).toBe(false);
    });

    test('does not return true for Idle without prior Processing', async () => {
      // First call returns Idle (no prior Processing), then time runs out
      let callIndex = 0;
      let now = 0;
      Date.now = mock(() => {
        const current = now;
        // Advance past timeout after first poll cycle
        if (callIndex > 0) {
          now += 70000;
        }
        callIndex++;
        return current;
      });

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<ScannerStatus><pwg:State>Idle</pwg:State></ScannerStatus>'),
        } as Response),
      );

      const result = await waitForScanReady(mockScannerHttp, 60000);

      expect(result).toBe(false);
    });

    test('ignores fetch errors during polling and continues', async () => {
      let callCount = 0;

      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        // After the error, transition Processing → Idle to finish quickly
        if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve('<ScannerStatus><pwg:State>Processing</pwg:State></ScannerStatus>'),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<ScannerStatus><pwg:State>Idle</pwg:State></ScannerStatus>'),
        } as Response);
      });

      const result = await waitForScanReady(mockScannerHttp, 30000);

      expect(result).toBe(true);
      expect(callCount).toBeGreaterThan(2);
    });

    test('ignores non-ok responses and continues polling', async () => {
      let callCount = 0;

      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
            text: () => Promise.resolve('Service Unavailable'),
          } as Response);
        }
        // After the error, transition Processing → Idle to finish quickly
        if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve('<ScannerStatus><pwg:State>Processing</pwg:State></ScannerStatus>'),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<ScannerStatus><pwg:State>Idle</pwg:State></ScannerStatus>'),
        } as Response);
      });

      const result = await waitForScanReady(mockScannerHttp, 30000);

      expect(result).toBe(true);
    });

    test('handles unknown state in XML response', async () => {
      let callCount = 0;
      let now = 0;
      Date.now = mock(() => {
        const current = now;
        if (callCount > 1) {
          now += 70000;
        }
        return current;
      });

      globalThis.fetch = mock(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve('<ScannerStatus><pwg:State>SomethingWeird</pwg:State></ScannerStatus>'),
        } as Response);
      });

      const result = await waitForScanReady(mockScannerHttp, 60000);

      expect(result).toBe(false);
    });

    test('polls the correct scanner status URL', async () => {
      let capturedUrl: string | undefined;
      let callCount = 0;

      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        callCount++;
        // Return Processing enough times to trigger the processingCount >= 5 exit
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve('<ScannerStatus><pwg:State>Processing</pwg:State></ScannerStatus>'),
        } as Response);
      });

      await waitForScanReady(mockScannerHttp, 30000);

      expect(capturedUrl).toBe('http://192.168.1.101:80/eSCL/ScannerStatus');
      expect(callCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('cancelScanJob', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test('sends DELETE request to the job URL', async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;

      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        capturedUrl = url;
        capturedMethod = options?.method;
        return Promise.resolve({ ok: true } as Response);
      });

      await cancelScanJob('http://192.168.1.100/eSCL/ScanJobs/1234');

      expect(capturedUrl).toBe('http://192.168.1.100/eSCL/ScanJobs/1234');
      expect(capturedMethod).toBe('DELETE');
    });

    test('does not throw on successful cancellation', async () => {
      globalThis.fetch = mock(() => Promise.resolve({ ok: true } as Response));

      // Should resolve without throwing
      await expect(
        cancelScanJob('http://192.168.1.100/eSCL/ScanJobs/1234'),
      ).resolves.toBeUndefined();
    });

    test('suppresses fetch errors without throwing', async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error('Connection refused')));

      // Should resolve without throwing despite the fetch error
      await expect(
        cancelScanJob('http://192.168.1.100/eSCL/ScanJobs/1234'),
      ).resolves.toBeUndefined();
    });

    test('suppresses HTTP error responses without throwing', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response),
      );

      // Should resolve without throwing even on 404
      await expect(
        cancelScanJob('http://192.168.1.100/eSCL/ScanJobs/9999'),
      ).resolves.toBeUndefined();
    });
  });

  describe('createScanJob', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test('returns success with job URL on 201 response', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({
            Location: 'http://192.168.1.100/eSCL/ScanJobs/1234',
          }),
        } as Response),
      );

      const result = await createScanJob(mockScannerHttp, { resolution: 300 });

      expect(result.success).toBe(true);
      expect(result.jobUrl).toBe('http://192.168.1.100/eSCL/ScanJobs/1234');
    });

    test('converts http to https URL when scanner port is 443', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({
            Location: 'http://192.168.1.100/eSCL/ScanJobs/1234',
          }),
        } as Response),
      );

      const result = await createScanJob(mockScanner, { resolution: 300 });

      expect(result.success).toBe(true);
      expect(result.jobUrl).toBe('https://192.168.1.100/eSCL/ScanJobs/1234');
    });

    test('returns error when no Location header', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({}),
        } as Response),
      );

      const result = await createScanJob(mockScanner, { resolution: 300 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No Location header in response');
    });

    test('returns error on HTTP error response', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        } as Response),
      );

      const result = await createScanJob(mockScanner, { resolution: 300 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    test('returns error on fetch exception', async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

      const result = await createScanJob(mockScanner, { resolution: 300 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    test('sends correct Content-Type header', async () => {
      let capturedOptions: RequestInit | undefined;

      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({
            Location: 'http://test/eSCL/ScanJobs/1',
          }),
        } as Response);
      });

      await createScanJob(mockScannerHttp, { resolution: 300 });

      expect(capturedOptions?.headers).toEqual({ 'Content-Type': 'text/xml' });
      expect(capturedOptions?.method).toBe('POST');
    });

    test('sends scan settings XML in request body', async () => {
      let capturedBody: string | undefined;

      globalThis.fetch = mock((_url: string, options?: RequestInit) => {
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({
            Location: 'http://test/eSCL/ScanJobs/1',
          }),
        } as Response);
      });

      await createScanJob(mockScannerHttp, { resolution: 600 });

      expect(capturedBody).toContain('<?xml version="1.0"');
      expect(capturedBody).toContain('<scan:XResolution>600</scan:XResolution>');
    });
  });
});
