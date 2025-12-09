/**
 * Tests for photo cropping functionality.
 * Following TDD principles - these tests should fail initially.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { cropAllPhotos, cropPhoto, MIN_PHOTO_SIZE } from '../../src/server/processing/cropper';
import type { DetectedPhoto } from '../../src/shared/types';

// Test fixtures
let testImageBuffer: Buffer;
let testImageMetadata: { width: number; height: number };

beforeAll(async () => {
  // Create a test image with distinct quadrants (simulating a scanned page with 4 photos)
  // Each quadrant is 800x600, total image is 1600x1200
  testImageBuffer = await sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      // Top-left: red tint
      {
        input: await sharp({
          create: {
            width: 700,
            height: 500,
            channels: 3,
            background: { r: 255, g: 200, b: 200 },
          },
        })
          .png()
          .toBuffer(),
        top: 50,
        left: 50,
      },
      // Top-right: green tint
      {
        input: await sharp({
          create: {
            width: 700,
            height: 500,
            channels: 3,
            background: { r: 200, g: 255, b: 200 },
          },
        })
          .png()
          .toBuffer(),
        top: 50,
        left: 850,
      },
      // Bottom-left: blue tint
      {
        input: await sharp({
          create: {
            width: 700,
            height: 500,
            channels: 3,
            background: { r: 200, g: 200, b: 255 },
          },
        })
          .png()
          .toBuffer(),
        top: 650,
        left: 50,
      },
      // Bottom-right: yellow tint
      {
        input: await sharp({
          create: {
            width: 700,
            height: 500,
            channels: 3,
            background: { r: 255, g: 255, b: 200 },
          },
        })
          .png()
          .toBuffer(),
        top: 650,
        left: 850,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  const metadata = await sharp(testImageBuffer).metadata();
  testImageMetadata = {
    width: metadata.width || 1600,
    height: metadata.height || 1200,
  };
});

describe('cropPhoto', () => {
  test('should extract a single photo region', async () => {
    const bounds = { x: 50, y: 50, width: 700, height: 500 };
    const result = await cropPhoto(testImageBuffer, bounds);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    // Verify extracted dimensions
    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(700);
    expect(metadata.height).toBe(500);
  });

  test('should produce high quality JPEG output', async () => {
    const bounds = { x: 100, y: 100, width: 400, height: 300 };
    const result = await cropPhoto(testImageBuffer, bounds);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('jpeg');

    // File size should indicate good quality (not over-compressed)
    expect(result.length).toBeGreaterThan(500);
  });

  test('should handle bounds at edge of image', async () => {
    const bounds = {
      x: testImageMetadata.width - 200,
      y: testImageMetadata.height - 150,
      width: 200,
      height: 150,
    };

    const result = await cropPhoto(testImageBuffer, bounds);

    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(150);
  });

  test('should clamp bounds that extend beyond image edges', async () => {
    // Bounds extend beyond right and bottom edges
    const bounds = {
      x: testImageMetadata.width - 100,
      y: testImageMetadata.height - 100,
      width: 300, // Extends 200px beyond edge
      height: 300, // Extends 200px beyond edge
    };

    const result = await cropPhoto(testImageBuffer, bounds);

    // Should be clamped to available space
    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBeLessThanOrEqual(100);
    expect(metadata.height).toBeLessThanOrEqual(100);
  });

  test('should handle bounds starting beyond image edges', async () => {
    // Starting position is beyond the image
    const bounds = {
      x: testImageMetadata.width + 100,
      y: testImageMetadata.height + 100,
      width: 200,
      height: 200,
    };

    // Should return null or throw error for completely invalid bounds
    await expect(cropPhoto(testImageBuffer, bounds)).rejects.toThrow();
  });

  test('should reject negative bounds', async () => {
    const bounds = { x: -50, y: -50, width: 200, height: 200 };

    // Should clamp negative positions to 0 or throw error
    await expect(cropPhoto(testImageBuffer, bounds)).rejects.toThrow();
  });

  test('should reject very small regions below minimum size', async () => {
    const bounds = {
      x: 100,
      y: 100,
      width: MIN_PHOTO_SIZE - 1,
      height: MIN_PHOTO_SIZE - 1,
    };

    await expect(cropPhoto(testImageBuffer, bounds)).rejects.toThrow(/too small/i);
  });

  test('should accept regions at minimum size threshold', async () => {
    const bounds = {
      x: 100,
      y: 100,
      width: MIN_PHOTO_SIZE,
      height: MIN_PHOTO_SIZE,
    };

    const result = await cropPhoto(testImageBuffer, bounds);

    expect(result).toBeInstanceOf(Buffer);
    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(MIN_PHOTO_SIZE);
    expect(metadata.height).toBe(MIN_PHOTO_SIZE);
  });

  test('should reject invalid image buffer', async () => {
    const invalidBuffer = Buffer.from('not an image');
    const bounds = { x: 0, y: 0, width: 100, height: 100 };

    await expect(cropPhoto(invalidBuffer, bounds)).rejects.toThrow();
  });

  test('should reject empty buffer', async () => {
    const emptyBuffer = Buffer.alloc(0);
    const bounds = { x: 0, y: 0, width: 100, height: 100 };

    await expect(cropPhoto(emptyBuffer, bounds)).rejects.toThrow();
  });
});

describe('cropAllPhotos', () => {
  test('should extract all detected photos from grid', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 700, height: 500 },
        confidence: 0.95,
      },
      {
        image: testImageBuffer,
        position: 'top-right',
        bounds: { x: 850, y: 50, width: 700, height: 500 },
        confidence: 0.92,
      },
      {
        image: testImageBuffer,
        position: 'bottom-left',
        bounds: { x: 50, y: 650, width: 700, height: 500 },
        confidence: 0.93,
      },
      {
        image: testImageBuffer,
        position: 'bottom-right',
        bounds: { x: 850, y: 650, width: 700, height: 500 },
        confidence: 0.91,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    expect(result).toHaveLength(4);

    // Verify each cropped photo
    for (let i = 0; i < result.length; i++) {
      const cropped = result[i];
      const detected = detectedPhotos[i];

      expect(cropped.image).toBeInstanceOf(Buffer);
      expect(cropped.image.length).toBeGreaterThan(0);
      expect(cropped.position).toBe(detected.position);
      expect(cropped.bounds).toEqual(detected.bounds);
      expect(cropped.originalBounds).toEqual(detected.bounds);
      expect(cropped.enhanced).toBe(false);

      // Verify dimensions
      const metadata = await sharp(cropped.image).metadata();
      expect(metadata.width).toBe(detected.bounds.width);
      expect(metadata.height).toBe(detected.bounds.height);
    }
  });

  test('should preserve position metadata', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 700, height: 500 },
        confidence: 0.95,
      },
      {
        image: testImageBuffer,
        position: 'bottom-right',
        bounds: { x: 850, y: 650, width: 700, height: 500 },
        confidence: 0.91,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    expect(result[0].position).toBe('top-left');
    expect(result[1].position).toBe('bottom-right');
  });

  test('should skip photos with bounds below minimum size', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 700, height: 500 },
        confidence: 0.95,
      },
      {
        image: testImageBuffer,
        position: 'top-right',
        bounds: { x: 850, y: 50, width: MIN_PHOTO_SIZE - 1, height: 500 }, // Too narrow
        confidence: 0.92,
      },
      {
        image: testImageBuffer,
        position: 'bottom-left',
        bounds: { x: 50, y: 650, width: 700, height: MIN_PHOTO_SIZE - 1 }, // Too short
        confidence: 0.93,
      },
      {
        image: testImageBuffer,
        position: 'bottom-right',
        bounds: { x: 850, y: 650, width: 700, height: 500 },
        confidence: 0.91,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    // Should only return the 2 valid photos
    expect(result).toHaveLength(2);
    expect(result[0].position).toBe('top-left');
    expect(result[1].position).toBe('bottom-right');
  });

  test('should handle empty detected photos array', async () => {
    const result = await cropAllPhotos(testImageBuffer, []);

    expect(result).toEqual([]);
  });

  test('should clamp photos with out-of-bounds regions', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'bottom-right',
        bounds: {
          x: testImageMetadata.width - 100,
          y: testImageMetadata.height - 100,
          width: 300, // Extends beyond
          height: 300, // Extends beyond
        },
        confidence: 0.91,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    expect(result).toHaveLength(1);

    // Bounds should be adjusted
    const metadata = await sharp(result[0].image).metadata();
    expect(metadata.width).toBeLessThanOrEqual(100);
    expect(metadata.height).toBeLessThanOrEqual(100);
  });

  test('should process photos independently (parallel processing)', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 700, height: 500 },
        confidence: 0.95,
      },
      {
        image: testImageBuffer,
        position: 'top-right',
        bounds: { x: 850, y: 50, width: 700, height: 500 },
        confidence: 0.92,
      },
    ];

    const startTime = performance.now();
    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);
    const duration = performance.now() - startTime;

    expect(result).toHaveLength(2);

    // Should complete reasonably fast (parallel processing)
    expect(duration).toBeLessThan(2000);
  });

  test('should handle single photo', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 700, height: 500 },
        confidence: 0.95,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    expect(result).toHaveLength(1);
    expect(result[0].position).toBe('top-left');
  });
});

describe('Integration with enhancement', () => {
  test('should support enhancement flag', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 700, height: 500 },
        confidence: 0.95,
      },
    ];

    // Test with enhancement option
    const result = await cropAllPhotos(testImageBuffer, detectedPhotos, {
      enhance: false,
    });

    expect(result[0].enhanced).toBe(false);
  });

  test('should preserve original bounds when enhancement is applied', async () => {
    const originalBounds = { x: 50, y: 50, width: 700, height: 500 };

    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: originalBounds,
        confidence: 0.95,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos, {
      enhance: false,
    });

    // Original bounds should be preserved regardless of enhancement
    expect(result[0].originalBounds).toEqual(originalBounds);
    expect(result[0].bounds).toEqual(originalBounds);
  });
});

describe('Edge cases and validation', () => {
  test('should reject invalid image buffer', async () => {
    const invalidBuffer = Buffer.from('not an image');
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: invalidBuffer,
        position: 'top-left',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 0.95,
      },
    ];

    await expect(cropAllPhotos(invalidBuffer, detectedPhotos)).rejects.toThrow();
  });

  test('should handle zero-width bounds gracefully', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 0, height: 500 },
        confidence: 0.95,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    // Should skip zero-width photo
    expect(result).toHaveLength(0);
  });

  test('should handle zero-height bounds gracefully', async () => {
    const detectedPhotos: DetectedPhoto[] = [
      {
        image: testImageBuffer,
        position: 'top-left',
        bounds: { x: 50, y: 50, width: 500, height: 0 },
        confidence: 0.95,
      },
    ];

    const result = await cropAllPhotos(testImageBuffer, detectedPhotos);

    // Should skip zero-height photo
    expect(result).toHaveLength(0);
  });
});

describe('Performance', () => {
  test('should process single crop quickly', async () => {
    const bounds = { x: 50, y: 50, width: 700, height: 500 };

    const startTime = performance.now();
    await cropPhoto(testImageBuffer, bounds);
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(500); // Should complete within 500ms
  });

  test('should process multiple crops efficiently', async () => {
    const detectedPhotos: DetectedPhoto[] = Array.from({ length: 4 }, (_i) => ({
      image: testImageBuffer,
      position: 'top-left' as const,
      bounds: { x: 50, y: 50, width: 700, height: 500 },
      confidence: 0.95,
    }));

    const startTime = performance.now();
    await cropAllPhotos(testImageBuffer, detectedPhotos);
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
  });
});
