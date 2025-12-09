/**
 * Tests for eSCL client functionality.
 * Tests the protocol logic without requiring actual scanner hardware.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DiscoveredScanner } from '../../src/server/services/scanner/discovery';
import {
  buildScanSettings,
  createScanJob,
  getScannerBaseUrl,
  VALID_RESOLUTIONS,
  type ValidResolution,
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
