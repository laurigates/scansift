/**
 * eSCL Client
 *
 * Implements the eSCL (AirPrint Scan) protocol for scanner communication.
 * Handles scan job creation, status polling, and document download.
 */

import type { ScanOptions } from '@/shared/types';
import { ScannerError } from '../../errors';
import type { DiscoveredScanner } from './discovery';

/**
 * Valid resolutions for eSCL scanning
 */
export const VALID_RESOLUTIONS = [100, 150, 200, 300, 600, 1200] as const;
export type ValidResolution = (typeof VALID_RESOLUTIONS)[number];

/**
 * Scan job result from the eSCL API
 */
export interface ScanJobResult {
  success: boolean;
  jobUrl?: string;
  error?: string;
}

/**
 * Progress callback for scan operations
 */
export type ScanProgressCallback = (
  stage: 'initiating' | 'scanning' | 'downloading',
  progress: number,
) => void;

/**
 * Default scan settings
 */
const DEFAULT_SCAN_SETTINGS = {
  resolution: 300 as ValidResolution,
  colorMode: 'RGB24',
  format: 'image/jpeg',
  intent: 'Photo',
  inputSource: 'Platen',
  colorSpace: 'sRGB',
};

/**
 * Get base URL for scanner (handles HTTP vs HTTPS based on port)
 */
export const getScannerBaseUrl = (scanner: DiscoveredScanner): string => {
  const host = scanner.addresses[0] || scanner.host;
  const protocol = scanner.port === 443 ? 'https' : 'http';
  return `${protocol}://${host}:${scanner.port}`;
};

/**
 * Build eSCL scan settings XML
 */
export const buildScanSettings = (options: ScanOptions): string => {
  const resolution = options.resolution ?? DEFAULT_SCAN_SETTINGS.resolution;
  const colorMode = options.colorMode ?? DEFAULT_SCAN_SETTINGS.colorMode;
  const format = options.format ?? DEFAULT_SCAN_SETTINGS.format;

  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <scan:Intent>${DEFAULT_SCAN_SETTINGS.intent}</scan:Intent>
  <scan:DocumentFormatExt>${format}</scan:DocumentFormatExt>
  <scan:XResolution>${resolution}</scan:XResolution>
  <scan:YResolution>${resolution}</scan:YResolution>
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:InputSource>${DEFAULT_SCAN_SETTINGS.inputSource}</scan:InputSource>
  <scan:ColorSpace>${DEFAULT_SCAN_SETTINGS.colorSpace}</scan:ColorSpace>
</scan:ScanSettings>`;
};

/**
 * Create a scan job on the scanner
 *
 * @param scanner - The discovered scanner
 * @param options - Scan options
 * @returns Promise resolving to scan job result with job URL
 */
export const createScanJob = async (
  scanner: DiscoveredScanner,
  options: ScanOptions,
): Promise<ScanJobResult> => {
  const baseUrl = getScannerBaseUrl(scanner);
  const settings = buildScanSettings(options);

  try {
    const response = await fetch(`${baseUrl}/eSCL/ScanJobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: settings,
      tls: {
        rejectUnauthorized: false,
      },
      // biome-ignore lint/suspicious/noExplicitAny: Bun's fetch API supports tls option
    } as any);

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${text}`,
      };
    }

    // Get job URL from Location header
    let location = response.headers.get('Location');
    if (!location) {
      return {
        success: false,
        error: 'No Location header in response',
      };
    }

    // Scanner may return http:// URL but require https:// access
    if (scanner.port === 443 && location.startsWith('http://')) {
      location = location.replace('http://', 'https://');
    }

    return {
      success: true,
      jobUrl: location,
    };
  } catch (error) {
    return {
      success: false,
      error: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/**
 * Wait for scan to complete by polling scanner status
 *
 * The Epson ET-3750 (and similar scanners) stays in "Processing" state
 * until the document is downloaded. We consider the scan ready after
 * seeing Processing for a few polling cycles.
 *
 * @param scanner - The discovered scanner
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to true if scan is ready
 */
export const waitForScanReady = async (
  scanner: DiscoveredScanner,
  timeoutMs: number = 60000,
): Promise<boolean> => {
  const startTime = Date.now();
  const baseUrl = getScannerBaseUrl(scanner);
  let sawProcessing = false;
  let processingCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/eSCL/ScannerStatus`, {
        tls: { rejectUnauthorized: false },
        // biome-ignore lint/suspicious/noExplicitAny: Bun's fetch API supports tls option
      } as any);

      if (response.ok) {
        const xml = await response.text();
        const stateMatch = xml.match(/<pwg:State>([^<]+)</i);
        const state = stateMatch?.[1] || 'Unknown';

        if (state === 'Processing') {
          sawProcessing = true;
          processingCount++;
          // After seeing Processing for 5+ seconds, assume scan hardware is done
          // The scanner stays in Processing until we download the document
          if (processingCount >= 5) {
            return true;
          }
        } else if (sawProcessing && state === 'Idle') {
          return true;
        }
      }
    } catch {
      // Ignore errors during polling - scanner may be busy
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
};

/**
 * Download the scanned document from the scanner
 *
 * Uses curl for better compatibility with scanner's chunked transfer encoding.
 *
 * @param jobUrl - The scan job URL
 * @returns Promise resolving to image buffer
 */
export const downloadDocument = async (jobUrl: string): Promise<Buffer> => {
  const documentUrl = `${jobUrl}/NextDocument`;

  // Use curl for better compatibility with scanner's transfer encoding
  // Some scanners use chunked encoding that Bun's fetch doesn't handle well
  const tempPath = `/tmp/scan-${Date.now()}.jpg`;

  const proc = Bun.spawn(['curl', '-sk', '-o', tempPath, documentUrl], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new ScannerError(`Failed to download scan: ${stderr}`);
  }

  // Read the downloaded file
  const file = Bun.file(tempPath);
  const size = file.size;

  if (size === 0) {
    throw new ScannerError('Downloaded scan is empty');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Clean up temp file
  await Bun.write(tempPath, ''); // Clear file
  // Note: Bun doesn't have unlink, file will be cleaned up by OS

  return buffer;
};

/**
 * Perform a complete scan operation
 *
 * Orchestrates the full eSCL scan workflow:
 * 1. Create scan job
 * 2. Wait for scan to complete
 * 3. Download the scanned image
 *
 * @param scanner - The discovered scanner
 * @param options - Scan options (resolution, colorMode, format)
 * @param timeoutMs - Timeout for scan operation
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to scanned image buffer
 */
export const performScan = async (
  scanner: DiscoveredScanner,
  options: ScanOptions,
  timeoutMs: number = 120000,
  onProgress?: ScanProgressCallback,
): Promise<Buffer> => {
  // Step 1: Create scan job
  onProgress?.('initiating', 0);

  const jobResult = await createScanJob(scanner, options);

  if (!jobResult.success || !jobResult.jobUrl) {
    throw new ScannerError(`Failed to create scan job: ${jobResult.error ?? 'Unknown error'}`);
  }

  onProgress?.('initiating', 100);

  // Step 2: Wait for scan to complete
  onProgress?.('scanning', 0);

  const ready = await waitForScanReady(scanner, timeoutMs);

  if (!ready) {
    throw new ScannerError('Scan timed out waiting for scanner');
  }

  onProgress?.('scanning', 100);

  // Step 3: Download the scanned image
  onProgress?.('downloading', 0);

  const imageBuffer = await downloadDocument(jobResult.jobUrl);

  onProgress?.('downloading', 100);

  return imageBuffer;
};

/**
 * Cancel a scan job
 *
 * @param jobUrl - The scan job URL to cancel
 */
export const cancelScanJob = async (jobUrl: string): Promise<void> => {
  try {
    await fetch(jobUrl, {
      method: 'DELETE',
      tls: { rejectUnauthorized: false },
      // biome-ignore lint/suspicious/noExplicitAny: Bun's fetch API supports tls option
    } as any);
  } catch {
    // Best effort - ignore errors when canceling
  }
};
