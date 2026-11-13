import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { detectPhotos } from '../../src/server/detection/photo-detector';
import { PERFORMANCE } from '../../src/shared/constants';

const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures', 'detection');

const SCAN_WIDTH = 2550;
const SCAN_HEIGHT = 3300;
const TEST_DPI = 300;
const PHOTO_W = 900;
const PHOTO_H = 1200;
const DETECTION_BUDGET_MS = PERFORMANCE.MAX_DETECTION_TIME_SECONDS * 1000;
const PHOTO_COLOR = { r: 30, g: 30, b: 30 };

async function darkRect(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background: PHOTO_COLOR },
  })
    .png()
    .toBuffer();
}

async function composeScan(
  photos: { x: number; y: number; w: number; h: number }[],
  width = SCAN_WIDTH,
  height = SCAN_HEIGHT,
): Promise<Buffer> {
  const composites = await Promise.all(
    photos.map(async (p) => ({
      input: await darkRect(p.w, p.h),
      top: p.y,
      left: p.x,
    })),
  );
  return await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

let singlePhotoScan: Buffer;
let twoPhotoTopRowScan: Buffer;
let columnScan: Buffer;
let fourPhotoScan: Buffer;
let stripScan: Buffer;
let fourThreeScan: Buffer;
let emptyScan: Buffer;
let undersizePhotoScan: Buffer;
let tinyImage: Buffer;

beforeAll(async () => {
  await mkdir(FIXTURES_DIR, { recursive: true });

  singlePhotoScan = await composeScan([
    { x: (SCAN_WIDTH - PHOTO_W) / 2, y: (SCAN_HEIGHT - PHOTO_H) / 2, w: PHOTO_W, h: PHOTO_H },
  ]);

  twoPhotoTopRowScan = await composeScan([
    { x: 200, y: 200, w: PHOTO_W, h: PHOTO_H },
    { x: SCAN_WIDTH - PHOTO_W - 200, y: 200, w: PHOTO_W, h: PHOTO_H },
  ]);

  columnScan = await composeScan([
    { x: 200, y: 200, w: PHOTO_W, h: PHOTO_H },
    { x: 200, y: SCAN_HEIGHT - PHOTO_H - 200, w: PHOTO_W, h: PHOTO_H },
  ]);

  fourPhotoScan = await composeScan([
    { x: 200, y: 200, w: PHOTO_W, h: PHOTO_H },
    { x: SCAN_WIDTH - PHOTO_W - 200, y: 200, w: PHOTO_W, h: PHOTO_H },
    { x: 200, y: SCAN_HEIGHT - PHOTO_H - 200, w: PHOTO_W, h: PHOTO_H },
    { x: SCAN_WIDTH - PHOTO_W - 200, y: SCAN_HEIGHT - PHOTO_H - 200, w: PHOTO_W, h: PHOTO_H },
  ]);

  stripScan = await composeScan([{ x: 275, y: 1450, w: 2000, h: 400 }]);

  fourThreeScan = await composeScan([{ x: 575, y: 1050, w: 1400, h: 1050 }]);

  emptyScan = await sharp({
    create: {
      width: SCAN_WIDTH,
      height: SCAN_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

  undersizePhotoScan = await composeScan([{ x: 1075, y: 1450, w: 400, h: 400 }]);

  tinyImage = await sharp({
    create: { width: 500, height: 500, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
});

describe('detectPhotos validation', () => {
  test('rejects unsupported DPI values', async () => {
    await expect(detectPhotos(emptyScan, 250)).rejects.toThrow(/Invalid DPI/);
  });

  test('accepts every documented DPI value', async () => {
    for (const dpi of [100, 150, 200, 300, 600, 1200]) {
      await expect(detectPhotos(emptyScan, dpi)).resolves.toBeDefined();
    }
  });

  test('rejects non-image buffers', async () => {
    await expect(detectPhotos(Buffer.from('not an image'), TEST_DPI)).rejects.toThrow(
      /Photo detection failed/,
    );
  });

  test('rejects empty buffers', async () => {
    await expect(detectPhotos(Buffer.alloc(0), TEST_DPI)).rejects.toThrow(/Photo detection failed/);
  });
});

describe('detectPhotos size filtering', () => {
  test('returns empty result when image is below minimum photo size', async () => {
    const result = await detectPhotos(tinyImage, TEST_DPI);

    expect(result.photos).toEqual([]);
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.[0]).toMatch(/No photos detected/i);
  });

  test('does not return regions for photos smaller than the minimum size threshold', async () => {
    const result = await detectPhotos(undersizePhotoScan, TEST_DPI);

    for (const photo of result.photos) {
      expect(photo.bounds.width).toBeGreaterThanOrEqual(2 * TEST_DPI);
      expect(photo.bounds.height).toBeGreaterThanOrEqual(2 * TEST_DPI);
    }
  });

  test('returns processingTime as a non-negative number', async () => {
    const result = await detectPhotos(singlePhotoScan, TEST_DPI);

    expect(typeof result.processingTime).toBe('number');
    expect(result.processingTime).toBeGreaterThanOrEqual(0);
  });
});

describe('detectPhotos result shape', () => {
  test('returns an object with photos, processingTime, and warnings', async () => {
    const result = await detectPhotos(singlePhotoScan, TEST_DPI);

    expect(result).toHaveProperty('photos');
    expect(result).toHaveProperty('processingTime');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.photos)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('reports the dimensions of the scan the bounds are measured in', async () => {
    const result = await detectPhotos(singlePhotoScan, TEST_DPI);

    expect(result.imageDimensions).toEqual({ width: SCAN_WIDTH, height: SCAN_HEIGHT });
  });

  test('caps the number of returned regions at four', async () => {
    const result = await detectPhotos(fourPhotoScan, TEST_DPI);

    expect(result.photos.length).toBeLessThanOrEqual(4);
  });

  test('caps results at four for a top-row two-photo scan', async () => {
    const result = await detectPhotos(twoPhotoTopRowScan, TEST_DPI);

    expect(result.photos.length).toBeLessThanOrEqual(4);
    for (const photo of result.photos) {
      expect(photo.bounds.width).toBeGreaterThan(0);
      expect(photo.bounds.height).toBeGreaterThan(0);
    }
  });

  test('every returned region carries a valid grid position and confidence', async () => {
    const result = await detectPhotos(fourPhotoScan, TEST_DPI);
    const validPositions = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

    for (const photo of result.photos) {
      expect(validPositions.has(photo.position)).toBe(true);
      expect(photo.confidence).toBeGreaterThan(0);
      expect(photo.confidence).toBeLessThanOrEqual(1);
      expect(photo.bounds.width).toBeGreaterThan(0);
      expect(photo.bounds.height).toBeGreaterThan(0);
    }
  });

  test('confidence falls within the documented 0.6 to 0.8 range', async () => {
    const result = await detectPhotos(singlePhotoScan, TEST_DPI);

    for (const photo of result.photos) {
      expect(photo.confidence).toBeGreaterThanOrEqual(0.6);
      expect(photo.confidence).toBeLessThanOrEqual(0.8);
    }
  });

  test('a 4:3 aspect ratio receives the higher 0.8 confidence', async () => {
    const result = await detectPhotos(fourThreeScan, TEST_DPI);

    expect(result.photos.length).toBeGreaterThanOrEqual(1);
    const top = result.photos[0];
    expect(top).toBeDefined();
    if (top) {
      expect(top.confidence).toBe(0.8);
    }
  });

  test('a 5:1 strip never scores higher than a 4:3 photo', async () => {
    const stripResult = await detectPhotos(stripScan, TEST_DPI);
    const fourThreeResult = await detectPhotos(fourThreeScan, TEST_DPI);

    const stripBest = stripResult.photos[0]?.confidence ?? 0;
    const fourThreeBest = fourThreeResult.photos[0]?.confidence ?? 0;

    expect(fourThreeBest).toBeGreaterThanOrEqual(stripBest);
  });
});

describe('detectPhotos performance', () => {
  test('a 4-photo 300-DPI scan completes within twice the budget', async () => {
    const start = performance.now();
    await detectPhotos(fourPhotoScan, TEST_DPI);
    const elapsed = performance.now() - start;

    if (elapsed > DETECTION_BUDGET_MS) {
      console.warn(
        `[photo-detector] 4-photo detection took ${elapsed.toFixed(0)}ms ` +
          `(budget ${DETECTION_BUDGET_MS}ms)`,
      );
    }

    expect(elapsed).toBeLessThan(DETECTION_BUDGET_MS * 2);
  });
});

const BOUNDS_TOLERANCE_PX = 15;

function expectBoundsNear(
  actual: { x: number; y: number; width: number; height: number } | undefined,
  expected: { x: number; y: number; width: number; height: number },
): void {
  expect(actual).toBeDefined();
  if (!actual) return;
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(BOUNDS_TOLERANCE_PX);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(BOUNDS_TOLERANCE_PX);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(BOUNDS_TOLERANCE_PX);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(BOUNDS_TOLERANCE_PX);
}

describe('detectPhotos grid assignment', () => {
  const left = 200;
  const right = SCAN_WIDTH - PHOTO_W - 200;
  const top = 200;
  const bottom = SCAN_HEIGHT - PHOTO_H - 200;

  test('returns one region centered for a single-photo scan with bounds matching the photo', async () => {
    const result = await detectPhotos(singlePhotoScan, TEST_DPI);

    expect(result.photos).toHaveLength(1);
    expectBoundsNear(result.photos[0]?.bounds, {
      x: (SCAN_WIDTH - PHOTO_W) / 2,
      y: (SCAN_HEIGHT - PHOTO_H) / 2,
      width: PHOTO_W,
      height: PHOTO_H,
    });
    // A photo centred on both midlines takes the first grid slot.
    expect(result.photos[0]?.position).toBe('top-left');
    expect(result.warnings).toEqual([]);
  });

  test('returns two regions with positions top-left and top-right for a top-row scan', async () => {
    const result = await detectPhotos(twoPhotoTopRowScan, TEST_DPI);

    expect(result.photos.map((p) => p.position)).toEqual(['top-left', 'top-right']);
    expectBoundsNear(result.photos[0]?.bounds, {
      x: left,
      y: top,
      width: PHOTO_W,
      height: PHOTO_H,
    });
    expectBoundsNear(result.photos[1]?.bounds, {
      x: right,
      y: top,
      width: PHOTO_W,
      height: PHOTO_H,
    });
  });

  test('returns two regions with positions top-left and bottom-left for a column scan', async () => {
    const result = await detectPhotos(columnScan, TEST_DPI);

    expect(result.photos.map((p) => p.position)).toEqual(['top-left', 'bottom-left']);
    expectBoundsNear(result.photos[0]?.bounds, {
      x: left,
      y: top,
      width: PHOTO_W,
      height: PHOTO_H,
    });
    expectBoundsNear(result.photos[1]?.bounds, {
      x: left,
      y: bottom,
      width: PHOTO_W,
      height: PHOTO_H,
    });
  });

  test('returns four regions covering all four grid positions exactly once for a 2x2 scan', async () => {
    const result = await detectPhotos(fourPhotoScan, TEST_DPI);

    expect(result.photos.map((p) => p.position)).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    const expected = [
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    ];
    for (const [i, origin] of expected.entries()) {
      expectBoundsNear(result.photos[i]?.bounds, { ...origin, width: PHOTO_W, height: PHOTO_H });
    }
  });

  test('a photo whose centre is a few pixels past both midlines still takes the first slot', async () => {
    const offCentreScan = await composeScan([
      {
        x: (SCAN_WIDTH - PHOTO_W) / 2 + 10,
        y: (SCAN_HEIGHT - PHOTO_H) / 2 + 10,
        w: PHOTO_W,
        h: PHOTO_H,
      },
    ]);

    const result = await detectPhotos(offCentreScan, TEST_DPI);

    expect(result.photos.map((p) => p.position)).toEqual(['top-left']);
  });

  test('assigns distinct positions when two photos fall in the same quadrant', async () => {
    const stackedScan = await composeScan([
      { x: 200, y: 100, w: 700, h: 700 },
      { x: 200, y: 1150, w: 700, h: 700 },
    ]);

    const result = await detectPhotos(stackedScan, TEST_DPI);

    expect(result.photos.map((p) => p.position)).toEqual(['top-left', 'bottom-left']);
    expectBoundsNear(result.photos[0]?.bounds, { x: 200, y: 100, width: 700, height: 700 });
    expectBoundsNear(result.photos[1]?.bounds, { x: 200, y: 1150, width: 700, height: 700 });
  });

  test('returns an empty array for a blank white scan with no photos', async () => {
    const result = await detectPhotos(emptyScan, TEST_DPI);

    expect(result.photos).toEqual([]);
    expect(result.warnings[0]).toMatch(/No photos detected/i);
  });
});
