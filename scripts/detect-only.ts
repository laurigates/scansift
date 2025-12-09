#!/usr/bin/env npx tsx
/**
 * Quick detection test on existing scan.
 * Run with: npx tsx scripts/detect-only.ts <image-path> [dpi]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { detectPhotos } from '../src/server/detection';
import type { DetectionResult } from '../src/shared/types';

const formatResult = (result: DetectionResult): void => {
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
  const imagePath = process.argv[2] || 'tmp/detection-test-2025-12-08T09-49-17-575Z.jpg';
  const dpi = parseInt(process.argv[3] || '300', 10);

  console.log(`🔬 Testing detection on: ${imagePath}`);
  console.log(`   DPI: ${dpi}\n`);

  try {
    const imageBuffer = await readFile(imagePath);
    console.log(`   Image size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log('   Running detection...');

    const result = await detectPhotos(imageBuffer, dpi);
    formatResult(result);

    // Save JSON
    const jsonPath = imagePath.replace(/\.[^.]+$/, '-detection.json');
    await writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(`\n📄 Results saved: ${jsonPath}`);
  } catch (error) {
    console.error(`\n❌ Detection failed:`, error);
    process.exit(1);
  }
};

main();
