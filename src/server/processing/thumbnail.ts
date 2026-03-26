/**
 * Thumbnail generation for photo previews.
 * Shared between REST API routes and WebSocket handler.
 */

import sharp from 'sharp';
import type { DetectedPhoto } from '@/shared/types';

/** Maximum thumbnail dimension in pixels */
const THUMBNAIL_MAX_SIZE = 400;

/** JPEG quality for thumbnails */
const THUMBNAIL_QUALITY = 85;

export interface PhotoPreview {
  position: string;
  thumbnail: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

/**
 * Generate base64 thumbnails for an array of detected photos.
 */
export async function generatePreviews(photos: DetectedPhoto[]): Promise<PhotoPreview[]> {
  return Promise.all(
    photos.map(async (photo) => {
      const thumbnail = await sharp(photo.image)
        .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toBuffer();

      return {
        position: photo.position,
        thumbnail: thumbnail.toString('base64'),
        bounds: photo.bounds,
        confidence: photo.confidence,
      };
    }),
  );
}
