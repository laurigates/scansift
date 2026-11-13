/**
 * Output organization for processed photos.
 *
 * Decides where a photo pair is written (date-based layout, FR-7.1/7.2),
 * builds its sidecar JSON (FR-7.3) and writes the extracted date to EXIF
 * (FR-6.3). Path and sidecar construction are pure; only nextSequence reads
 * the filesystem and only writeExifDate touches image data.
 *
 * @module organizer
 */

import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import type { GridPosition, PhotoMetadata, PhotoPair } from '@/shared/types';

/** Directory under the output root that holds the organized photos. */
export const PROCESSED_DIR = 'processed';

/** Directory (and file name prefix) for photos without an extracted date. */
const UNKNOWN_NAME = 'unknown';

const JPEG_QUALITY = 95;

/**
 * Where one photo pair is written.
 */
export interface OutputPaths {
  directory: string;
  frontPath: string;
  backPath: string;
  /** PNG archival copy of the front; written only when archival is on. */
  frontArchivalPath: string;
  /** PNG archival copy of the back; written only when archival is on. */
  backArchivalPath: string;
  sidecarPath: string;
}

/**
 * OCR output of one side of a photo as stored in the sidecar.
 */
export interface SidecarOcr {
  extractedText: string | null;
  extractedDate: string | null;
  confidence: number;
  words: Array<{ text: string; confidence: number }>;
}

/**
 * Sidecar JSON written next to each photo pair.
 */
export interface Sidecar {
  batchId: string;
  gridPosition: GridPosition;
  /** ISO-8601 timestamp of the front scan. */
  scanDate: string;
  /** Local calendar day (YYYY-MM-DD) the photo was dated to, or null. */
  photoDate: string | null;
  /** File name of the front image, relative to the sidecar. */
  front: string;
  /** File name of the back image, or null for a front-only pair. */
  back: string | null;
  ocr: { front: SidecarOcr | null; back: SidecarOcr | null };
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * Format a date as YYYY-MM-DD from its local calendar fields. chrono-node
 * returns local-time dates, so toISOString() could shift the day across the
 * UTC boundary.
 */
const formatLocalDay = (date: Date): string =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;

/**
 * The date a pair is organized under. Dates are normally written on the
 * back, so back OCR wins over front.
 */
export const resolvePhotoDate = (pair: PhotoPair): Date | undefined =>
  pair.back?.metadata?.extractedDate ?? pair.front.metadata?.extractedDate;

/**
 * File name prefix shared by every file of a photo dated to `date`
 * (YYYY-MM-DD), or the undated prefix.
 */
export const outputPrefix = (date: Date | undefined): string =>
  date ? formatLocalDay(date) : UNKNOWN_NAME;

/**
 * Directory a photo dated to `date` is written to.
 */
export const outputDirectoryFor = (root: string, date: Date | undefined): string =>
  date
    ? join(root, PROCESSED_DIR, pad(date.getFullYear(), 4), pad(date.getMonth() + 1, 2))
    : join(root, PROCESSED_DIR, UNKNOWN_NAME);

/**
 * Build the output paths for one photo pair.
 *
 * Dated:   {root}/processed/YYYY/MM/YYYY-MM-DD_NNN_front.jpg
 * Undated: {root}/processed/unknown/unknown_NNN_front.jpg
 */
export const buildOutputPaths = (
  root: string,
  date: Date | undefined,
  sequence: number,
): OutputPaths => {
  const directory = outputDirectoryFor(root, date);
  const base = `${outputPrefix(date)}_${pad(sequence, 3)}`;
  return {
    directory,
    frontPath: join(directory, `${base}_front.jpg`),
    backPath: join(directory, `${base}_back.jpg`),
    frontArchivalPath: join(directory, `${base}_front.png`),
    backArchivalPath: join(directory, `${base}_back.png`),
    sidecarPath: join(directory, `${base}.json`),
  };
};

/**
 * Next free sequence number for `prefix` in `directory`: one past the highest
 * NNN among existing `{prefix}_NNN...` files, so a later batch never
 * overwrites an earlier one. A missing directory counts as empty.
 *
 * Not safe against concurrent writers to the same directory.
 */
export const nextSequence = async (directory: string, prefix: string): Promise<number> => {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 1;
    }
    throw error;
  }

  const highest = entries.reduce((max, entry) => {
    if (!entry.startsWith(`${prefix}_`)) {
      return max;
    }
    const match = /^(\d+)[_.]/.exec(entry.slice(prefix.length + 1));
    return match?.[1] ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return highest + 1;
};

const toSidecarOcr = (metadata: PhotoMetadata | undefined): SidecarOcr | null =>
  metadata
    ? {
        extractedText: metadata.extractedText ?? null,
        extractedDate: metadata.extractedDate?.toISOString() ?? null,
        confidence: metadata.confidence,
        words: metadata.words ?? [],
      }
    : null;

/**
 * Build the sidecar JSON for one photo pair. Text is kept whether or not a
 * date was found (FR-6.4).
 */
export const buildSidecar = (
  pair: PhotoPair,
  paths: OutputPaths,
  batchId: string,
  scanTimestamp: Date,
): Sidecar => {
  const photoDate = resolvePhotoDate(pair);
  return {
    batchId,
    gridPosition: pair.position,
    scanDate: scanTimestamp.toISOString(),
    photoDate: photoDate ? formatLocalDay(photoDate) : null,
    front: basename(paths.frontPath),
    back: pair.back ? basename(paths.backPath) : null,
    ocr: {
      front: toSidecarOcr(pair.front.metadata),
      back: toSidecarOcr(pair.back?.metadata),
    },
  };
};

/**
 * Write `date` to the EXIF DateTimeOriginal and DateTime tags of a JPEG.
 *
 * sharp can only attach EXIF while encoding, so the image is re-encoded at
 * quality 95.
 *
 * @throws if the buffer is not a decodable image
 */
export const writeExifDate = async (image: Buffer, date: Date): Promise<Buffer> => {
  const exifDate =
    `${pad(date.getFullYear(), 4)}:${pad(date.getMonth() + 1, 2)}:${pad(date.getDate(), 2)} ` +
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}`;

  return sharp(image)
    .withExif({ IFD0: { DateTime: exifDate }, IFD2: { DateTimeOriginal: exifDate } })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
};
