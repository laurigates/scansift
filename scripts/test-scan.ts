#!/usr/bin/env bun
/**
 * Test Scan Script
 *
 * Run with: bun scripts/test-scan.ts
 *
 * Performs a test scan using the eSCL protocol to validate scanner communication.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type DiscoveredScanner, discoverScanners } from '../src/server/services/scanner/discovery';

const TMP_DIR = join(import.meta.dir, '../tmp');

interface ScanJobResult {
  success: boolean;
  jobUrl?: string;
  imagePath?: string;
  error?: string;
}

/**
 * Valid resolutions for Epson ET-3750 (from capabilities)
 */
const VALID_RESOLUTIONS = [100, 200, 300, 600, 1200] as const;
type ValidResolution = (typeof VALID_RESOLUTIONS)[number];

/**
 * Build eSCL scan settings XML
 * Based on scanner capabilities response
 */
const buildScanSettings = (resolution: ValidResolution = 300): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <scan:Intent>Photo</scan:Intent>
  <scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
  <scan:XResolution>${resolution}</scan:XResolution>
  <scan:YResolution>${resolution}</scan:YResolution>
  <scan:ColorMode>RGB24</scan:ColorMode>
  <scan:InputSource>Platen</scan:InputSource>
  <scan:ColorSpace>sRGB</scan:ColorSpace>
</scan:ScanSettings>`;
};

/**
 * Get base URL for scanner (handles HTTP vs HTTPS)
 */
const getScannerBaseUrl = (scanner: DiscoveredScanner): string => {
  const host = scanner.addresses[0] || scanner.host;
  const protocol = scanner.port === 443 ? 'https' : 'http';
  return `${protocol}://${host}:${scanner.port}`;
};

/**
 * Initiate a scan job
 */
const initiateScan = async (
  scanner: DiscoveredScanner,
  resolution: ValidResolution = 300,
): Promise<ScanJobResult> => {
  const baseUrl = getScannerBaseUrl(scanner);
  const settings = buildScanSettings(resolution);

  console.log(`📤 Initiating scan at ${resolution} DPI...`);

  try {
    const response = await fetch(`${baseUrl}/eSCL/ScanJobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: settings,
      // @ts-expect-error - Bun supports this option
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs
      },
    });

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

    console.log(`✅ Scan job created: ${location}`);
    return {
      success: true,
      jobUrl: location,
    };
  } catch (error) {
    return {
      success: false,
      error: `Request failed: ${error}`,
    };
  }
};

/**
 * Wait for scan to complete by polling scanner status
 * Epson ET-3750 stays in Processing until document is downloaded
 */
const waitForScanComplete = async (
  _jobUrl: string,
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
        // @ts-expect-error - Bun supports this option
        tls: { rejectUnauthorized: false },
      });

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
            console.log('   Scanner processing... document should be ready');
            return true;
          }
          console.log(`   Scanner state: ${state} (${processingCount}/5)`);
        } else if (sawProcessing && state === 'Idle') {
          console.log('   Scan complete!');
          return true;
        } else {
          console.log(`   Scanner state: ${state}`);
        }
      }
    } catch {
      // Ignore errors during polling
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('⏰ Timeout waiting for scan to complete');
  return false;
};

/**
 * Download the scanned image using curl (more compatible with scanner encoding)
 */
const downloadScan = async (jobUrl: string, outputPath: string): Promise<boolean> => {
  const documentUrl = `${jobUrl}/NextDocument`;

  console.log(`📥 Downloading scan from ${documentUrl}...`);

  try {
    // Use curl for better compatibility with scanner's transfer encoding
    const proc = Bun.spawn(['curl', '-sk', '-o', outputPath, documentUrl], {
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.log(`❌ Failed to download: curl exited with ${exitCode}`);
      return false;
    }

    // Verify the file was created
    const file = Bun.file(outputPath);
    const size = file.size;

    if (size === 0) {
      console.log('❌ Downloaded file is empty');
      return false;
    }

    console.log(`✅ Saved to: ${outputPath}`);
    console.log(`   Size: ${(size / 1024).toFixed(1)} KB`);

    return true;
  } catch (error) {
    console.log(`❌ Download failed: ${error}`);
    return false;
  }
};

const main = async () => {
  console.log('🧪 PhotoScan - Scanner Test\n');
  console.log('This will perform a test scan to validate eSCL communication.\n');

  // Discover scanners
  console.log('🔍 Discovering scanners...');
  const scanners = await discoverScanners();

  if (scanners.length === 0) {
    console.log('❌ No scanners found. Run scanner:discover first.');
    process.exit(1);
  }

  const scanner = scanners[0];
  console.log(`\n✅ Using scanner: ${scanner.name}\n`);

  // Ensure tmp directory exists
  await mkdir(TMP_DIR, { recursive: true });

  // Initiate scan at low resolution for speed (100 DPI is the lowest supported)
  const result = await initiateScan(scanner, 100);

  if (!result.success || !result.jobUrl) {
    console.log(`\n❌ Failed to initiate scan: ${result.error}`);
    process.exit(1);
  }

  // Wait for scan to complete
  console.log('\n⏳ Waiting for scan to complete...');
  const completed = await waitForScanComplete(result.jobUrl, scanner);

  if (!completed) {
    console.log('\n❌ Scan did not complete successfully');
    process.exit(1);
  }

  // Download the scan
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(TMP_DIR, `test-scan-${timestamp}.jpg`);

  console.log('');
  const downloaded = await downloadScan(result.jobUrl, outputPath);

  if (!downloaded) {
    console.log('\n❌ Failed to download scan');
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('✨ Test scan completed successfully!');
  console.log('═'.repeat(60));
  console.log('\neSCL communication with your scanner is working correctly.');
  console.log('You can find the test scan at:', outputPath);
  console.log('\nNext steps:');
  console.log('  1. Check the scanned image quality');
  console.log('  2. Test with higher resolution (300/600 DPI)');
  console.log('  3. Proceed with photo detection implementation\n');
};

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
