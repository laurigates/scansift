import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  buildOutputPaths,
  buildSidecar,
  nextSequence,
  resolvePhotoDate,
  writeExifDate,
} from '../../src/server/processing/organizer';
import type { CroppedPhoto, PhotoMetadata, PhotoPair } from '../../src/shared/types';

const bounds = { x: 0, y: 0, width: 10, height: 10 };

function side(metadata?: PhotoMetadata): CroppedPhoto {
  const photo: CroppedPhoto = {
    image: Buffer.from('image'),
    position: 'top-left',
    bounds,
    originalBounds: bounds,
  };
  if (metadata) {
    photo.metadata = metadata;
  }
  return photo;
}

function pairOf(front?: PhotoMetadata, back?: PhotoMetadata | 'none'): PhotoPair {
  const pair: PhotoPair = { front: side(front), position: 'top-left' };
  if (back !== 'none') {
    pair.back = side(back);
  }
  return pair;
}

// Local-time constructors: the layout is derived from local getters.
const june14 = new Date(1987, 5, 14, 12, 0, 0);
const march3 = new Date(1990, 2, 3, 12, 0, 0);

describe('resolvePhotoDate', () => {
  test('prefers the date found on the back', () => {
    const pair = pairOf(
      { confidence: 0.5, extractedDate: march3 },
      { confidence: 0.5, extractedDate: june14 },
    );
    expect(resolvePhotoDate(pair)).toBe(june14);
  });

  test('falls back to the front when the back has no date', () => {
    const pair = pairOf({ confidence: 0.5, extractedDate: march3 }, { confidence: 0.5 });
    expect(resolvePhotoDate(pair)).toBe(march3);
  });

  test('falls back to the front when there is no back', () => {
    expect(resolvePhotoDate(pairOf({ confidence: 0.5, extractedDate: march3 }, 'none'))).toBe(
      march3,
    );
  });

  test('returns undefined when neither side has a date', () => {
    expect(resolvePhotoDate(pairOf({ confidence: 0.5 }, { confidence: 0.5 }))).toBeUndefined();
    expect(resolvePhotoDate(pairOf(undefined, 'none'))).toBeUndefined();
  });
});

describe('buildOutputPaths', () => {
  test('dated photos go to processed/YYYY/MM with a YYYY-MM-DD_NNN base name', () => {
    const paths = buildOutputPaths('/out', june14, 1);
    expect(paths.directory).toBe(join('/out', 'processed', '1987', '06'));
    expect(paths.frontPath).toBe(
      join('/out', 'processed', '1987', '06', '1987-06-14_001_front.jpg'),
    );
    expect(paths.backPath).toBe(join('/out', 'processed', '1987', '06', '1987-06-14_001_back.jpg'));
    expect(paths.sidecarPath).toBe(join('/out', 'processed', '1987', '06', '1987-06-14_001.json'));
  });

  test('zero-pads month, day and sequence', () => {
    const paths = buildOutputPaths('/out', march3, 42);
    expect(paths.frontPath).toBe(
      join('/out', 'processed', '1990', '03', '1990-03-03_042_front.jpg'),
    );
  });

  test('uses the local calendar day late in the evening and early in the morning', () => {
    expect(buildOutputPaths('/out', new Date(1987, 5, 14, 23, 59, 59), 1).frontPath).toContain(
      '1987-06-14_001',
    );
    expect(buildOutputPaths('/out', new Date(1987, 5, 14, 0, 0, 1), 1).frontPath).toContain(
      '1987-06-14_001',
    );
  });

  test('undated photos go to processed/unknown with an unknown_NNN base name', () => {
    const paths = buildOutputPaths('/out', undefined, 7);
    expect(paths.directory).toBe(join('/out', 'processed', 'unknown'));
    expect(paths.frontPath).toBe(join('/out', 'processed', 'unknown', 'unknown_007_front.jpg'));
    expect(paths.backPath).toBe(join('/out', 'processed', 'unknown', 'unknown_007_back.jpg'));
    expect(paths.sidecarPath).toBe(join('/out', 'processed', 'unknown', 'unknown_007.json'));
  });

  test('archival PNG paths share the base name of the JPEGs', () => {
    const dated = buildOutputPaths('/out', june14, 1);
    expect(dated.frontArchivalPath).toBe(
      join('/out', 'processed', '1987', '06', '1987-06-14_001_front.png'),
    );
    expect(dated.backArchivalPath).toBe(
      join('/out', 'processed', '1987', '06', '1987-06-14_001_back.png'),
    );
    const undated = buildOutputPaths('/out', undefined, 7);
    expect(undated.frontArchivalPath).toBe(
      join('/out', 'processed', 'unknown', 'unknown_007_front.png'),
    );
  });

  test('keeps sequences above 999 unambiguous', () => {
    expect(buildOutputPaths('/out', undefined, 1000).frontPath).toContain('unknown_1000_front.jpg');
  });
});

describe('nextSequence', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scansift-organizer-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('is 1 for a directory that does not exist', async () => {
    expect(await nextSequence(join(dir, 'missing'), '1987-06-14')).toBe(1);
  });

  test('is 1 for an empty directory', async () => {
    expect(await nextSequence(dir, '1987-06-14')).toBe(1);
  });

  test('is one past the highest existing sequence, ignoring gaps', async () => {
    await writeFile(join(dir, '1987-06-14_001_front.jpg'), '');
    await writeFile(join(dir, '1987-06-14_001_back.jpg'), '');
    await writeFile(join(dir, '1987-06-14_003_front.jpg'), '');
    expect(await nextSequence(dir, '1987-06-14')).toBe(4);
  });

  test('counts only files with the given prefix', async () => {
    await writeFile(join(dir, '1987-06-15_009_front.jpg'), '');
    await writeFile(join(dir, 'notes.txt'), '');
    await writeFile(join(dir, '1987-06-14_002.json'), '');
    expect(await nextSequence(dir, '1987-06-14')).toBe(3);
    expect(await nextSequence(dir, 'unknown')).toBe(1);
  });

  test('propagates errors other than a missing directory', async () => {
    const file = join(dir, 'a-file');
    await writeFile(file, '');
    await expect(nextSequence(file, 'unknown')).rejects.toThrow();
    await mkdir(join(dir, 'ok'));
    expect(await nextSequence(join(dir, 'ok'), 'unknown')).toBe(1);
  });
});

describe('buildSidecar', () => {
  const scanTimestamp = new Date('2026-11-13T10:00:00.000Z');

  test('records batch, position, dates, file names and per-side OCR output', () => {
    const pair = pairOf(
      { confidence: 0.3, words: [] },
      {
        extractedText: 'June 14 1987',
        extractedDate: june14,
        confidence: 0.8,
        words: [{ text: 'June', confidence: 0.9 }],
      },
    );
    const paths = buildOutputPaths('/out', june14, 1);

    expect(buildSidecar(pair, paths, 'batch-1', scanTimestamp)).toEqual({
      batchId: 'batch-1',
      gridPosition: 'top-left',
      scanDate: '2026-11-13T10:00:00.000Z',
      photoDate: '1987-06-14',
      front: '1987-06-14_001_front.jpg',
      back: '1987-06-14_001_back.jpg',
      ocr: {
        front: { extractedText: null, extractedDate: null, confidence: 0.3, words: [] },
        back: {
          extractedText: 'June 14 1987',
          extractedDate: june14.toISOString(),
          confidence: 0.8,
          words: [{ text: 'June', confidence: 0.9 }],
        },
      },
    });
  });

  test('keeps extracted text when no date was found', () => {
    const pair = pairOf(undefined, { extractedText: 'Grandma and Bob', confidence: 0.7 });
    const sidecar = buildSidecar(
      pair,
      buildOutputPaths('/out', undefined, 2),
      'batch-1',
      scanTimestamp,
    );

    expect(sidecar.photoDate).toBeNull();
    expect(sidecar.front).toBe('unknown_002_front.jpg');
    expect(sidecar.ocr.back?.extractedText).toBe('Grandma and Bob');
    expect(sidecar.ocr.back?.words).toEqual([]);
    expect(sidecar.ocr.front).toBeNull();
  });

  test('has null back entries for a front-only pair', () => {
    const pair = pairOf({ confidence: 0.1 }, 'none');
    const sidecar = buildSidecar(
      pair,
      buildOutputPaths('/out', undefined, 1),
      'batch-1',
      scanTimestamp,
    );

    expect(sidecar.back).toBeNull();
    expect(sidecar.ocr.back).toBeNull();
  });
});

describe('writeExifDate', () => {
  const makeJpeg = () =>
    sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 10, b: 10 } } })
      .jpeg()
      .toBuffer();

  test('control: a JPEG that was not tagged has no EXIF block', async () => {
    const metadata = await sharp(await makeJpeg()).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  test('writes the date as DateTimeOriginal and DateTime', async () => {
    const tagged = await writeExifDate(await makeJpeg(), new Date(1987, 5, 14, 9, 5, 7));
    const metadata = await sharp(tagged).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(32);
    const exif = metadata.exif;
    expect(exif).toBeDefined();
    if (!exif) return;
    // EXIF date format is "YYYY:MM:DD HH:MM:SS"; one occurrence per tag.
    expect(exif.toString('latin1').split('1987:06:14 09:05:07').length - 1).toBe(2);
    // Tag id 0x9003 (DateTimeOriginal) in either byte order.
    expect(
      exif.includes(Buffer.from([0x90, 0x03])) || exif.includes(Buffer.from([0x03, 0x90])),
    ).toBe(true);
  });

  test('rejects a buffer that is not an image', async () => {
    await expect(writeExifDate(Buffer.from('not a jpeg'), june14)).rejects.toThrow();
  });
});
