/**
 * Tests for skew angle estimation.
 */

import { describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { estimateSkewAngle } from '../../src/server/processing/deskew';
import { enhancePhoto } from '../../src/server/processing/enhancer';

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * A 1000x800 white scan holding one 600x400 photo rotated clockwise by `degrees`.
 * The photo is a dark frame around a mid-grey block, so it has edges on its
 * outline and inside it.
 */
async function scanWithPhotoRotatedBy(degrees: number): Promise<Buffer> {
  const inner = await sharp({
    create: { width: 300, height: 150, channels: 3, background: { r: 150, g: 150, b: 150 } },
  })
    .png()
    .toBuffer();

  const photo = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 40, g: 50, b: 60 } },
  })
    .composite([{ input: inner, left: 100, top: 80 }])
    .png()
    .toBuffer();

  const rotated = await sharp(photo)
    .rotate(degrees, { background: { ...WHITE, alpha: 1 } })
    .png()
    .toBuffer();

  return sharp({ create: { width: 1000, height: 800, channels: 3, background: WHITE } })
    .composite([{ input: rotated, gravity: 'centre' }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * A 1000x800 white scan holding one 600x400 photo filled with blobby texture
 * (upscaled seeded noise), rotated clockwise by `degrees`. The content has
 * edges in every direction and far more edge pixels than the outline has.
 */
async function scanWithTexturedPhotoRotatedBy(degrees: number, seed: number): Promise<Buffer> {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const noise = Buffer.alloc(75 * 50 * 3);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = 40 + Math.floor(next() * 180);
  }

  const rotated = await sharp(noise, { raw: { width: 75, height: 50, channels: 3 } })
    .resize(600, 400, { kernel: 'cubic' })
    .png()
    .toBuffer()
    .then((photo) =>
      sharp(photo)
        .rotate(degrees, { background: { ...WHITE, alpha: 1 } })
        .png()
        .toBuffer(),
    );

  return sharp({ create: { width: 1000, height: 800, channels: 3, background: WHITE } })
    .composite([{ input: rotated, gravity: 'centre' }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('estimateSkewAngle', () => {
  test('returns the correcting angle for a photo rotated clockwise by 5 degrees', async () => {
    const angle = await estimateSkewAngle(await scanWithPhotoRotatedBy(5));

    expect(Math.abs(angle - -5)).toBeLessThanOrEqual(0.5);
  });

  test('returns the correcting angle for a photo rotated anticlockwise by 7 degrees', async () => {
    const angle = await estimateSkewAngle(await scanWithPhotoRotatedBy(-7));

    expect(Math.abs(angle - 7)).toBeLessThanOrEqual(0.5);
  });

  for (const seed of [1, 2, 3]) {
    for (const degrees of [-8, -2, 1, 4]) {
      test(`finds a ${degrees} degree skew under textured content (seed ${seed})`, async () => {
        const angle = await estimateSkewAngle(await scanWithTexturedPhotoRotatedBy(degrees, seed));

        expect(Math.abs(angle - -degrees)).toBeLessThanOrEqual(0.5);
      });
    }

    test(`returns exactly 0 for a straight textured photo (seed ${seed})`, async () => {
      expect(await estimateSkewAngle(await scanWithTexturedPhotoRotatedBy(0, seed))).toBe(0);
    });
  }

  test('returns exactly 0 for a straight photo', async () => {
    const angle = await estimateSkewAngle(await scanWithPhotoRotatedBy(0));

    expect(angle).toBe(0);
  });

  test('returns exactly 0 for a blank image', async () => {
    const blank = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: WHITE },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    expect(await estimateSkewAngle(blank)).toBe(0);
  });

  test('returns exactly 0 for a photo skewed beyond the search range', async () => {
    const angle = await estimateSkewAngle(await scanWithPhotoRotatedBy(30));

    expect(angle).toBe(0);
  });

  for (const degrees of [6, -3]) {
    test(`rotating by the estimate straightens a ${degrees} degree skew`, async () => {
      const skewed = await scanWithTexturedPhotoRotatedBy(degrees, 1);
      const angle = await estimateSkewAngle(skewed);

      const corrected = await enhancePhoto(skewed, { rotation: angle });

      expect(Math.abs(angle - -degrees)).toBeLessThanOrEqual(0.5);
      expect(await estimateSkewAngle(corrected.buffer)).toBe(0);
    });
  }

  test('rejects an empty buffer', async () => {
    await expect(estimateSkewAngle(Buffer.alloc(0))).rejects.toThrow();
  });
});
