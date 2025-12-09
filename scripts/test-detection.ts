#!/usr/bin/env bun
/**
 * Test Detection Script
 *
 * Run with: bun scripts/test-detection.ts
 *
 * Performs a scan and runs photo detection to validate the algorithm.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPhotos } from '../src/server/detection';
import { type DiscoveredScanner, discoverScanners } from '../src/server/services/scanner/discovery';
import type { DetectionResult } from '../src/shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '../tmp');

/**
 * Valid resolutions for Epson ET-3750
 */
const VALID_RESOLUTIONS = [100, 200, 300, 600, 1200] as const;
type ValidResolution = (typeof VALID_RESOLUTIONS)[number];

/**
 * Build eSCL scan settings XML
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
 * Get base URL for scanner
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
): Promise<{ success: boolean; jobUrl?: string; error?: string }> => {
  const baseUrl = getScannerBaseUrl(scanner);
  const settings = buildScanSettings(resolution);

  console.log(`📤 Initiating scan at ${resolution} DPI...`);

  const response = await fetch(`${baseUrl}/eSCL/ScanJobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: settings,
    // @ts-expect-error - Bun supports this option
    tls: { rejectUnauthorized: false },
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `HTTP ${response.status}: ${text}` };
  }

  let location = response.headers.get('Location');
  if (!location) {
    return { success: false, error: 'No Location header in response' };
  }

  if (scanner.port === 443 && location.startsWith('http://')) {
    location = location.replace('http://', 'https://');
  }

  console.log(`✅ Scan job created`);
  return { success: true, jobUrl: location };
};

/**
 * Wait for scan to complete
 */
const waitForScanComplete = async (
  scanner: DiscoveredScanner,
  timeoutMs: number = 120000,
): Promise<boolean> => {
  const startTime = Date.now();
  const baseUrl = getScannerBaseUrl(scanner);
  let processingCount = 0;

  process.stdout.write('⏳ Scanning');

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
          processingCount++;
          process.stdout.write('.');
          if (processingCount >= 3) {
            console.log(' ready!');
            return true;
          }
        } else if (state === 'Idle' && processingCount > 0) {
          console.log(' complete!');
          return true;
        }
      }
    } catch {
      // Ignore polling errors
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(' timeout!');
  return false;
};

/**
 * Download the scanned image
 */
const downloadScan = async (jobUrl: string, outputPath: string): Promise<boolean> => {
  const documentUrl = `${jobUrl}/NextDocument`;

  console.log(`📥 Downloading scan...`);

  const proc = Bun.spawn(['curl', '-sk', '-o', outputPath, documentUrl], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) return false;

  const file = Bun.file(outputPath);
  const size = file.size;

  if (size === 0) return false;

  console.log(`✅ Saved: ${outputPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  return true;
};

/**
 * Format detection results for display
 */
const formatDetectionResult = (result: DetectionResult): void => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📸 DETECTION RESULTS');
  console.log('═'.repeat(60));

  console.log(`\nPhotos detected: ${result.photos.length}`);
  console.log(`Processing time: ${result.processingTimeMs}ms`);

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((w) => {
      console.log(`   - ${w}`);
    });
  }

  if (result.photos.length > 0) {
    console.log('\nDetected photos:');
    console.log('─'.repeat(60));

    result.photos.forEach((photo, i) => {
      const { x, y, width, height } = photo.bounds;
      console.log(`\n  Photo ${i + 1}: Position ${photo.position}`);
      console.log(`    Bounds: x=${x}, y=${y}, ${width}x${height}px`);
      console.log(`    Confidence: ${(photo.confidence * 100).toFixed(1)}%`);
    });
  }

  console.log(`\n${'═'.repeat(60)}`);
};

const main = async () => {
  const DPI: ValidResolution = 300; // Use 300 DPI for detection

  console.log('🧪 PhotoScan - Detection Test\n');
  console.log('This will scan and detect photos on the flatbed.\n');

  // Discover scanners
  console.log('🔍 Discovering scanners...');
  const scanners = await discoverScanners();

  if (scanners.length === 0) {
    console.log('❌ No scanners found.');
    process.exit(1);
  }

  const scanner = scanners[0];
  console.log(`✅ Using: ${scanner.name}\n`);

  // Ensure tmp directory exists
  await mkdir(TMP_DIR, { recursive: true });

  // Initiate scan
  const result = await initiateScan(scanner, DPI);

  if (!result.success || !result.jobUrl) {
    console.log(`❌ Failed to initiate scan: ${result.error}`);
    process.exit(1);
  }

  // Wait for scan to complete
  const completed = await waitForScanComplete(scanner);

  if (!completed) {
    console.log('❌ Scan did not complete');
    process.exit(1);
  }

  // Download the scan
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scanPath = join(TMP_DIR, `detection-test-${timestamp}.jpg`);

  const downloaded = await downloadScan(result.jobUrl, scanPath);

  if (!downloaded) {
    console.log('❌ Failed to download scan');
    process.exit(1);
  }

  // Run detection
  console.log('\n🔬 Running photo detection...');

  try {
    const imageBuffer = await readFile(scanPath);
    const detectionResult = await detectPhotos(imageBuffer, DPI);

    formatDetectionResult(detectionResult);

    // Save detection result as JSON
    const jsonPath = scanPath.replace('.jpg', '-detection.json');
    await writeFile(jsonPath, JSON.stringify(detectionResult, null, 2));
    console.log(`📄 Detection data saved: ${jsonPath}`);

    // Summary
    if (detectionResult.photos.length === 4) {
      console.log('\n✨ Success! All 4 photos detected.');
    } else if (detectionResult.photos.length > 0) {
      console.log(`\n⚠️  Detected ${detectionResult.photos.length}/4 photos. Check positioning.`);
    } else {
      console.log('\n❌ No photos detected. Check scanner bed or algorithm.');
    }
  } catch (error) {
    console.log(`\n❌ Detection failed: ${error}`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
