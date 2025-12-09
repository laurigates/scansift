/**
 * Photo cropping functionality for extracting individual photos from scanned images.
 * Uses Sharp for high-performance image extraction with quality preservation.
 *
 * @example
 * ```typescript
 * // Crop a single photo region
 * const croppedBuffer = await cropPhoto(scanBuffer, {
 *   x: 100, y: 100, width: 800, height: 600
 * });
 *
 * // Crop all detected photos from a scan
 * const croppedPhotos = await cropAllPhotos(scanBuffer, detectedPhotos);
 * ```
 *
 * @module cropper
 */

import sharp from 'sharp';
import type { CroppedPhoto, DetectedPhoto } from '../../shared/types';

/**
 * Minimum photo dimension to prevent extracting noise or invalid regions.
 * Photos smaller than this in either dimension will be rejected.
 */
export const MIN_PHOTO_SIZE = 100; // pixels

/**
 * JPEG quality for cropped photos (high quality to preserve scanned photo detail).
 */
const JPEG_QUALITY = 92;

/**
 * Bounds for image extraction.
 */
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Options for cropping operations.
 */
interface CropOptions {
  enhance?: boolean;
}

/**
 * Validate image buffer is not empty or undefined.
 *
 * @param imageBuffer - Buffer to validate
 * @throws Error if buffer is invalid
 */
function validateImageBuffer(imageBuffer: Buffer): void {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Invalid image buffer: buffer is empty or undefined');
  }
}

/**
 * Validate and clamp bounds to ensure they're within image dimensions.
 *
 * @param bounds - Requested extraction bounds
 * @param imageWidth - Source image width
 * @param imageHeight - Source image height
 * @returns Clamped bounds that fit within image
 * @throws Error if bounds are completely invalid or too small
 */
function validateAndClampBounds(bounds: Bounds, imageWidth: number, imageHeight: number): Bounds {
  // Reject negative positions
  if (bounds.x < 0 || bounds.y < 0) {
    throw new Error(`Invalid bounds: position cannot be negative (x: ${bounds.x}, y: ${bounds.y})`);
  }

  // Reject zero or negative dimensions
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error(
      `Invalid bounds: dimensions must be positive (width: ${bounds.width}, height: ${bounds.height})`,
    );
  }

  // Check if starting position is beyond image
  if (bounds.x >= imageWidth || bounds.y >= imageHeight) {
    throw new Error(
      `Invalid bounds: starting position (${bounds.x}, ${bounds.y}) is beyond image dimensions (${imageWidth}x${imageHeight})`,
    );
  }

  // Clamp dimensions to fit within image
  const clampedWidth = Math.min(bounds.width, imageWidth - bounds.x);
  const clampedHeight = Math.min(bounds.height, imageHeight - bounds.y);

  // Check minimum size after clamping
  if (clampedWidth < MIN_PHOTO_SIZE || clampedHeight < MIN_PHOTO_SIZE) {
    throw new Error(
      `Region too small after clamping: ${clampedWidth}x${clampedHeight} (minimum: ${MIN_PHOTO_SIZE}x${MIN_PHOTO_SIZE})`,
    );
  }

  return {
    x: bounds.x,
    y: bounds.y,
    width: clampedWidth,
    height: clampedHeight,
  };
}

/**
 * Extract a single photo region from a scanned image.
 *
 * @param imageBuffer - Source image buffer (JPEG, PNG, etc.)
 * @param bounds - Region to extract (x, y, width, height)
 * @returns Promise resolving to cropped image buffer as high-quality JPEG
 * @throws Error if buffer is invalid, bounds are invalid, or extraction fails
 */
export async function cropPhoto(imageBuffer: Buffer, bounds: Bounds): Promise<Buffer> {
  // Validate input buffer
  validateImageBuffer(imageBuffer);

  // Load image and get dimensions
  let sharpInstance: sharp.Sharp;
  try {
    sharpInstance = sharp(imageBuffer);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load image: ${errorMessage}`);
  }

  const metadata = await sharpInstance.metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) {
    throw new Error('Failed to read image dimensions');
  }

  // Validate and clamp bounds
  const validBounds = validateAndClampBounds(bounds, imageWidth, imageHeight);

  // Extract region using Sharp's extract operation
  try {
    const croppedBuffer = await sharpInstance
      .extract({
        left: validBounds.x,
        top: validBounds.y,
        width: validBounds.width,
        height: validBounds.height,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return croppedBuffer;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract photo region: ${errorMessage}`);
  }
}

/**
 * Extract all detected photos from a scanned image.
 *
 * Processes photos in parallel for performance. Photos with invalid bounds
 * or dimensions below MIN_PHOTO_SIZE are skipped.
 *
 * @param imageBuffer - Source image buffer containing all photos
 * @param photos - Array of detected photos with bounds
 * @param options - Optional cropping options (e.g., enhancement)
 * @returns Promise resolving to array of cropped photos with metadata
 * @throws Error if image buffer is invalid
 */
export async function cropAllPhotos(
  imageBuffer: Buffer,
  photos: DetectedPhoto[],
  options: CropOptions = {},
): Promise<CroppedPhoto[]> {
  // Validate input buffer
  validateImageBuffer(imageBuffer);

  // Handle empty photos array
  if (photos.length === 0) {
    return [];
  }

  // Get image dimensions for validation
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load image: ${errorMessage}`);
  }

  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) {
    throw new Error('Failed to read image dimensions');
  }

  // Process all photos in parallel, filtering out invalid ones
  const cropPromises = photos.map(async (photo) => {
    try {
      // Validate and clamp bounds
      const validBounds = validateAndClampBounds(photo.bounds, imageWidth, imageHeight);

      // Extract the photo region
      const croppedBuffer = await cropPhoto(imageBuffer, validBounds);

      // Return cropped photo with metadata
      const croppedPhoto: CroppedPhoto = {
        image: croppedBuffer,
        position: photo.position,
        bounds: validBounds,
        originalBounds: { ...photo.bounds }, // Preserve original bounds
        enhanced: options.enhance || false,
      };

      return croppedPhoto;
    } catch (_error) {
      // Skip photos with invalid bounds (e.g., too small, out of bounds)
      // This is expected behavior for edge detection artifacts
      return null;
    }
  });

  // Wait for all crops to complete and filter out skipped photos
  const results = await Promise.all(cropPromises);
  const validPhotos = results.filter((photo): photo is CroppedPhoto => photo !== null);

  return validPhotos;
}
