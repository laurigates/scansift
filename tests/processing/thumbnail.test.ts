import { beforeAll, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { generatePreviews } from '../../src/server/processing/thumbnail';
import { PERFORMANCE } from '../../src/shared/constants';
import type { DetectedPhoto, GridPosition } from '../../src/shared/types';

const PREVIEW_BUDGET_MS = PERFORMANCE.MAX_PREVIEW_TIME_SECONDS * 1000;
const THUMBNAIL_MAX_DIM = 400;

let largePhoto: Buffer;
let mediumPhoto: Buffer;
let smallPhoto: Buffer;
let portraitPhoto: Buffer;

async function buildPhoto(
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
): Promise<Buffer> {
  return await sharp({ create: { width, height, channels: 3, background } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

function makeDetectedPhoto(image: Buffer, position: GridPosition): DetectedPhoto {
  return {
    image,
    position,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    confidence: 0.8,
  };
}

beforeAll(async () => {
  largePhoto = await buildPhoto(2400, 1800, { r: 200, g: 100, b: 50 });
  mediumPhoto = await buildPhoto(1500, 1200, { r: 100, g: 150, b: 200 });
  smallPhoto = await buildPhoto(800, 600, { r: 50, g: 200, b: 100 });
  portraitPhoto = await buildPhoto(1200, 1800, { r: 180, g: 90, b: 220 });
});

describe('generatePreviews shape', () => {
  test('returns one preview per detected photo', async () => {
    const photos: DetectedPhoto[] = [
      makeDetectedPhoto(largePhoto, 'top-left'),
      makeDetectedPhoto(mediumPhoto, 'top-right'),
      makeDetectedPhoto(smallPhoto, 'bottom-left'),
      makeDetectedPhoto(portraitPhoto, 'bottom-right'),
    ];

    const previews = await generatePreviews(photos);

    expect(previews).toHaveLength(4);
  });

  test('returns an empty array when given no photos', async () => {
    const previews = await generatePreviews([]);

    expect(previews).toEqual([]);
  });

  test('handles a partial grid (fewer than four photos) by returning only inputs', async () => {
    const photos: DetectedPhoto[] = [
      makeDetectedPhoto(mediumPhoto, 'top-left'),
      makeDetectedPhoto(smallPhoto, 'bottom-right'),
    ];

    const previews = await generatePreviews(photos);

    expect(previews).toHaveLength(2);
    expect(previews.map((p) => p.position)).toEqual(['top-left', 'bottom-right']);
  });

  test('preserves position, bounds, and confidence on each preview', async () => {
    const detected: DetectedPhoto = {
      image: mediumPhoto,
      position: 'top-right',
      bounds: { x: 100, y: 200, width: 1500, height: 1200 },
      confidence: 0.73,
    };

    const [preview] = await generatePreviews([detected]);

    expect(preview).toBeDefined();
    expect(preview?.position).toBe('top-right');
    expect(preview?.bounds).toEqual({ x: 100, y: 200, width: 1500, height: 1200 });
    expect(preview?.confidence).toBe(0.73);
  });
});

describe('generatePreviews JPEG output', () => {
  test('each thumbnail is a valid base64-encoded JPEG with the FF D8 FF magic bytes', async () => {
    const photos: DetectedPhoto[] = [
      makeDetectedPhoto(largePhoto, 'top-left'),
      makeDetectedPhoto(mediumPhoto, 'top-right'),
      makeDetectedPhoto(smallPhoto, 'bottom-left'),
    ];

    const previews = await generatePreviews(photos);

    for (const preview of previews) {
      expect(typeof preview.thumbnail).toBe('string');
      expect(preview.thumbnail.length).toBeGreaterThan(0);

      const decoded = Buffer.from(preview.thumbnail, 'base64');
      expect(decoded.length).toBeGreaterThan(0);
      expect(decoded[0]).toBe(0xff);
      expect(decoded[1]).toBe(0xd8);
      expect(decoded[2]).toBe(0xff);

      const metadata = await sharp(decoded).metadata();
      expect(metadata.format).toBe('jpeg');
    }
  });

  test('every thumbnail dimension is bounded by 400px', async () => {
    const photos: DetectedPhoto[] = [
      makeDetectedPhoto(largePhoto, 'top-left'),
      makeDetectedPhoto(mediumPhoto, 'top-right'),
      makeDetectedPhoto(portraitPhoto, 'bottom-left'),
    ];

    const previews = await generatePreviews(photos);

    for (const preview of previews) {
      const decoded = Buffer.from(preview.thumbnail, 'base64');
      const metadata = await sharp(decoded).metadata();
      expect(metadata.width ?? 0).toBeLessThanOrEqual(THUMBNAIL_MAX_DIM);
      expect(metadata.height ?? 0).toBeLessThanOrEqual(THUMBNAIL_MAX_DIM);
      expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(
        THUMBNAIL_MAX_DIM,
      );
    }
  });

  test('preserves aspect ratio when downscaling', async () => {
    const photos: DetectedPhoto[] = [makeDetectedPhoto(largePhoto, 'top-left')];

    const [preview] = await generatePreviews(photos);
    expect(preview).toBeDefined();
    if (!preview) return;

    const decoded = Buffer.from(preview.thumbnail, 'base64');
    const metadata = await sharp(decoded).metadata();
    const inputAspect = 2400 / 1800;
    const outputAspect = (metadata.width ?? 1) / (metadata.height ?? 1);

    expect(Math.abs(inputAspect - outputAspect)).toBeLessThan(0.05);
  });

  test('does not enlarge thumbnails for inputs already smaller than the max dimension', async () => {
    const tiny = await buildPhoto(200, 150, { r: 60, g: 60, b: 60 });
    const photos: DetectedPhoto[] = [makeDetectedPhoto(tiny, 'top-left')];

    const [preview] = await generatePreviews(photos);
    expect(preview).toBeDefined();
    if (!preview) return;

    const decoded = Buffer.from(preview.thumbnail, 'base64');
    const metadata = await sharp(decoded).metadata();
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(150);
  });

  test('quality-85 JPEGs stay well under the raw byte size for downscaled images', async () => {
    const photos: DetectedPhoto[] = [makeDetectedPhoto(largePhoto, 'top-left')];

    const [preview] = await generatePreviews(photos);
    expect(preview).toBeDefined();
    if (!preview) return;

    const decoded = Buffer.from(preview.thumbnail, 'base64');
    expect(decoded.length).toBeGreaterThan(200);
    expect(decoded.length).toBeLessThan(400 * 400 * 3);
  });
});

describe('generatePreviews error handling', () => {
  test('throws when given an invalid image buffer', async () => {
    const photos: DetectedPhoto[] = [makeDetectedPhoto(Buffer.from('not an image'), 'top-left')];

    await expect(generatePreviews(photos)).rejects.toThrow();
  });

  test('throws when given an empty image buffer', async () => {
    const photos: DetectedPhoto[] = [makeDetectedPhoto(Buffer.alloc(0), 'top-left')];

    await expect(generatePreviews(photos)).rejects.toThrow();
  });
});

describe('generatePreviews performance', () => {
  test('a four-photo set completes within the preview generation budget', async () => {
    const photos: DetectedPhoto[] = [
      makeDetectedPhoto(largePhoto, 'top-left'),
      makeDetectedPhoto(mediumPhoto, 'top-right'),
      makeDetectedPhoto(portraitPhoto, 'bottom-left'),
      makeDetectedPhoto(smallPhoto, 'bottom-right'),
    ];

    const start = performance.now();
    await generatePreviews(photos);
    const elapsed = performance.now() - start;

    if (elapsed > PREVIEW_BUDGET_MS) {
      console.warn(
        `[thumbnail] 4-photo preview generation took ${elapsed.toFixed(0)}ms ` +
          `(budget ${PREVIEW_BUDGET_MS}ms)`,
      );
    }

    expect(elapsed).toBeLessThan(PREVIEW_BUDGET_MS);
  });

  test('processes photos in parallel rather than sequentially', async () => {
    const photos: DetectedPhoto[] = [
      makeDetectedPhoto(largePhoto, 'top-left'),
      makeDetectedPhoto(largePhoto, 'top-right'),
      makeDetectedPhoto(largePhoto, 'bottom-left'),
      makeDetectedPhoto(largePhoto, 'bottom-right'),
    ];

    const oneStart = performance.now();
    await generatePreviews([makeDetectedPhoto(largePhoto, 'top-left')]);
    const oneDuration = performance.now() - oneStart;

    const fourStart = performance.now();
    await generatePreviews(photos);
    const fourDuration = performance.now() - fourStart;

    expect(fourDuration).toBeLessThan(oneDuration * 4);
  });
});
