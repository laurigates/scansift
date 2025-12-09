/**
 * Tests for image enhancement pipeline.
 * Following TDD principles - these tests should fail initially.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import {
  enhancePhoto,
  PRESET_LIGHT,
  PRESET_STANDARD,
  PRESET_VINTAGE,
} from '../../src/server/processing/enhancer';
import type { EnhancementOptions } from '../../src/shared/types';

// Test fixtures
let testJpegBuffer: Buffer;
let testPngBuffer: Buffer;

beforeAll(async () => {
  // Create test images
  testJpegBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 180, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  testPngBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 150, g: 150, b: 180 },
    },
  })
    .png()
    .toBuffer();
});

describe('enhancePhoto', () => {
  test('should process image with default options', async () => {
    const result = await enhancePhoto(testJpegBuffer);

    expect(result).toBeDefined();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.processingTime).toBeGreaterThan(0);
    expect(result.appliedEnhancements).toBeArray();
    expect(result.outputFormat).toBe('jpeg');
    expect(result.dimensions).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });

  test('should handle JPEG input correctly', async () => {
    const result = await enhancePhoto(testJpegBuffer);

    expect(result.inputFormat).toBe('jpeg');
    expect(result.outputFormat).toBe('jpeg');
  });

  test('should handle PNG input correctly', async () => {
    const result = await enhancePhoto(testPngBuffer);

    expect(result.inputFormat).toBe('png');
    expect(result.outputFormat).toBe('jpeg'); // Should convert to JPEG for storage
  });

  test('should preserve image dimensions when no rotation', async () => {
    const result = await enhancePhoto(testJpegBuffer, { normalize: true });

    expect(result.dimensions.width).toBe(800);
    expect(result.dimensions.height).toBe(600);
  });

  test('should apply sharpening when requested', async () => {
    const result = await enhancePhoto(testJpegBuffer, { sharpen: true });

    const sharpenEnhancement = result.appliedEnhancements.find((e) => e.type === 'sharpen');
    expect(sharpenEnhancement).toBeDefined();
    expect(sharpenEnhancement?.description).toContain('sharpen');
  });

  test('should apply custom sharpen parameters', async () => {
    const result = await enhancePhoto(testJpegBuffer, {
      sharpen: { sigma: 2, m1: 0.8, m2: 0.5 },
    });

    const sharpenEnhancement = result.appliedEnhancements.find((e) => e.type === 'sharpen');
    expect(sharpenEnhancement).toBeDefined();
    expect(sharpenEnhancement?.parameters).toMatchObject({
      sigma: 2,
      m1: 0.8,
      m2: 0.5,
    });
  });

  test('should apply normalization when requested', async () => {
    const result = await enhancePhoto(testJpegBuffer, { normalize: true });

    const normalizeEnhancement = result.appliedEnhancements.find((e) => e.type === 'normalize');
    expect(normalizeEnhancement).toBeDefined();
  });

  test('should apply gamma correction when requested', async () => {
    const result = await enhancePhoto(testJpegBuffer, { gamma: 1.5 });

    const gammaEnhancement = result.appliedEnhancements.find((e) => e.type === 'gamma');
    expect(gammaEnhancement).toBeDefined();
    expect(gammaEnhancement?.parameters?.gamma).toBe(1.5);
  });

  test('should apply rotation when requested', async () => {
    const result = await enhancePhoto(testJpegBuffer, { rotation: 90 });

    const rotationEnhancement = result.appliedEnhancements.find((e) => e.type === 'rotation');
    expect(rotationEnhancement).toBeDefined();
    expect(rotationEnhancement?.parameters?.degrees).toBe(90);

    // Check dimensions are swapped after 90 degree rotation
    expect(result.dimensions.width).toBe(600);
    expect(result.dimensions.height).toBe(800);
  });

  test('should apply white balance correction when requested', async () => {
    const result = await enhancePhoto(testJpegBuffer, { whiteBalance: true });

    const wbEnhancement = result.appliedEnhancements.find((e) => e.type === 'whiteBalance');
    expect(wbEnhancement).toBeDefined();
  });

  test('should chain multiple enhancements', async () => {
    const options: EnhancementOptions = {
      normalize: true,
      sharpen: true,
      gamma: 1.2,
      whiteBalance: true,
    };

    const result = await enhancePhoto(testJpegBuffer, options);

    expect(result.appliedEnhancements).toHaveLength(5); // 4 + format
    expect(result.appliedEnhancements.map((e) => e.type)).toContain('normalize');
    expect(result.appliedEnhancements.map((e) => e.type)).toContain('sharpen');
    expect(result.appliedEnhancements.map((e) => e.type)).toContain('gamma');
    expect(result.appliedEnhancements.map((e) => e.type)).toContain('whiteBalance');
  });

  test('should output high quality JPEG', async () => {
    const result = await enhancePhoto(testJpegBuffer);

    // Verify it's a valid JPEG
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('jpeg');

    // Quality should produce reasonable file size (not over-compressed)
    expect(result.buffer.length).toBeGreaterThan(1000);
  });

  test('should measure processing time accurately', async () => {
    const result = await enhancePhoto(testJpegBuffer, {
      normalize: true,
      sharpen: true,
    });

    expect(result.processingTime).toBeGreaterThan(0);
    expect(result.processingTime).toBeLessThan(5000); // Should complete within 5 seconds
  });

  test('should handle rotation of 0 degrees', async () => {
    const result = await enhancePhoto(testJpegBuffer, { rotation: 0 });

    // No rotation enhancement should be applied for 0 degrees
    const rotationEnhancement = result.appliedEnhancements.find((e) => e.type === 'rotation');
    expect(rotationEnhancement).toBeUndefined();
  });

  test('should handle negative rotation angles', async () => {
    const result = await enhancePhoto(testJpegBuffer, { rotation: -45 });

    const rotationEnhancement = result.appliedEnhancements.find((e) => e.type === 'rotation');
    expect(rotationEnhancement).toBeDefined();
    expect(rotationEnhancement?.parameters?.degrees).toBe(-45);
  });

  test('should reject invalid image buffer', async () => {
    const invalidBuffer = Buffer.from('not an image');

    await expect(enhancePhoto(invalidBuffer)).rejects.toThrow();
  });

  test('should reject empty buffer', async () => {
    const emptyBuffer = Buffer.alloc(0);

    await expect(enhancePhoto(emptyBuffer)).rejects.toThrow();
  });
});

describe('Enhancement presets', () => {
  test('PRESET_LIGHT should apply minimal processing', async () => {
    const result = await enhancePhoto(testJpegBuffer, PRESET_LIGHT);

    // Should only apply sharpening
    const enhancementTypes = result.appliedEnhancements
      .map((e) => e.type)
      .filter((t) => t !== 'format');

    expect(enhancementTypes).toContain('sharpen');
    expect(enhancementTypes).not.toContain('normalize');
    expect(enhancementTypes).not.toContain('whiteBalance');
  });

  test('PRESET_STANDARD should apply normalize, sharpen, and white balance', async () => {
    const result = await enhancePhoto(testJpegBuffer, PRESET_STANDARD);

    const enhancementTypes = result.appliedEnhancements.map((e) => e.type);

    expect(enhancementTypes).toContain('normalize');
    expect(enhancementTypes).toContain('sharpen');
    expect(enhancementTypes).toContain('whiteBalance');
  });

  test('PRESET_VINTAGE should apply aggressive restoration', async () => {
    const result = await enhancePhoto(testJpegBuffer, PRESET_VINTAGE);

    const enhancementTypes = result.appliedEnhancements.map((e) => e.type);

    expect(enhancementTypes).toContain('normalize');
    expect(enhancementTypes).toContain('sharpen');
    expect(enhancementTypes).toContain('whiteBalance');
    expect(enhancementTypes).toContain('gamma');

    // Verify gamma is present for faded photo restoration
    const gammaEnhancement = result.appliedEnhancements.find((e) => e.type === 'gamma');
    expect(gammaEnhancement?.parameters?.gamma).toBeGreaterThan(1.0);
  });

  test('all presets should produce valid output', async () => {
    const presets = [PRESET_LIGHT, PRESET_STANDARD, PRESET_VINTAGE];

    for (const preset of presets) {
      const result = await enhancePhoto(testJpegBuffer, preset);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);

      // Verify output is valid image
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('jpeg');
    }
  });
});

describe('Performance and efficiency', () => {
  test('should complete basic enhancement quickly', async () => {
    const startTime = performance.now();
    await enhancePhoto(testJpegBuffer, { sharpen: true });
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });

  test('should handle large images efficiently', async () => {
    // Create a larger test image
    const largeBuffer = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    const startTime = performance.now();
    const result = await enhancePhoto(largeBuffer, PRESET_STANDARD);
    const duration = performance.now() - startTime;

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
  });
});
