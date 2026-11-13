/**
 * Image enhancement pipeline for scanned photos.
 * Uses Sharp for high-performance image processing.
 *
 * @example
 * ```typescript
 * // Basic usage with preset
 * const result = await enhancePhoto(imageBuffer, PRESET_STANDARD);
 *
 * // Custom enhancement options
 * const result = await enhancePhoto(imageBuffer, {
 *   normalize: true,
 *   sharpen: { sigma: 1.5 },
 *   gamma: 1.2,
 *   rotation: 90
 * });
 *
 * // Save the enhanced image
 * await fs.writeFile('enhanced.jpg', result.buffer);
 * console.log(`Processing time: ${result.processingTime}ms`);
 * console.log('Applied:', result.appliedEnhancements);
 * ```
 *
 * @module enhancer
 */

import sharp from 'sharp';
import type { AppliedEnhancement, EnhancementOptions, EnhancementResult } from '../../shared/types';

/**
 * Default sharpening parameters optimized for scanned photos.
 */
const DEFAULT_SHARPEN = {
  sigma: 1.5, // Blur sigma (lower = more aggressive)
  m1: 1.0, // Flat area threshold
  m2: 0.2, // Jagged area threshold
};

/**
 * Resolve sharpen parameters from options.
 * @param sharpenOption - Boolean or custom sharpen parameters
 * @returns Resolved sharpen parameters
 */
function resolveSharpenParams(
  sharpenOption: boolean | { sigma?: number; m1?: number; m2?: number },
): { sigma: number; m1: number; m2: number } {
  if (typeof sharpenOption === 'boolean') {
    return DEFAULT_SHARPEN;
  }

  return {
    sigma: sharpenOption.sigma ?? DEFAULT_SHARPEN.sigma,
    m1: sharpenOption.m1 ?? DEFAULT_SHARPEN.m1,
    m2: sharpenOption.m2 ?? DEFAULT_SHARPEN.m2,
  };
}

/**
 * High JPEG quality setting to preserve scanned photo detail.
 */
const JPEG_QUALITY = 95;

/**
 * Pixels trimmed from each side of the inscribed rectangle, so the
 * interpolated edge of the rotated image stays out of the crop.
 */
const INSCRIBED_MARGIN_PX = 1;

/**
 * Size of the largest axis-aligned rectangle that fits inside a width x height
 * rectangle rotated by `degrees`. It is centred on the rotated rectangle.
 *
 * @param width - Width of the image before rotation
 * @param height - Height of the image before rotation
 * @param degrees - Rotation angle
 * @returns Width and height of the inscribed rectangle (fractional)
 */
export function inscribedRectangle(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const widthIsLonger = width >= height;
  const long = widthIsLonger ? width : height;
  const short = widthIsLonger ? height : width;

  if (short <= 2 * sin * cos * long || Math.abs(sin - cos) < 1e-10) {
    // Half-constrained: two corners of the crop touch the long sides.
    const half = short / 2;
    return widthIsLonger
      ? { width: half / sin, height: half / cos }
      : { width: half / cos, height: half / sin };
  }

  // Fully constrained: the crop touches all four sides.
  const cos2 = cos * cos - sin * sin;
  return {
    width: (width * cos - height * sin) / cos2,
    height: (height * cos - width * sin) / cos2,
  };
}

/**
 * Preset: Minimal processing - sharpen only.
 * Use for high-quality scans that need minor touch-up.
 */
export const PRESET_LIGHT: EnhancementOptions = {
  sharpen: true,
};

/**
 * Preset: Standard processing - normalize, sharpen, auto white balance.
 * Use for most scanned photos with typical scanning artifacts.
 */
export const PRESET_STANDARD: EnhancementOptions = {
  normalize: true,
  sharpen: true,
  whiteBalance: true,
};

/**
 * Preset: Aggressive restoration for old, faded photos.
 * Includes gamma correction to recover detail in faded areas.
 */
export const PRESET_VINTAGE: EnhancementOptions = {
  normalize: true,
  sharpen: { sigma: 1.2, m1: 1.0, m2: 0.3 }, // More aggressive sharpening
  whiteBalance: true,
  gamma: 1.3, // Brighten faded photos
};

/**
 * Enhance a scanned photo with various image processing operations.
 *
 * Processing pipeline:
 * 1. Load and validate image
 * 2. Apply rotation (if specified); after a rotation that is not a multiple
 *    of 90 degrees, crop to the rectangle inscribed in the rotated image
 * 3. Apply white balance correction (if enabled)
 * 4. Apply normalization (contrast/brightness)
 * 5. Apply gamma correction (if specified)
 * 6. Apply sharpening (if enabled)
 * 7. Convert to high-quality JPEG
 *
 * @param imageBuffer - Input image buffer (JPEG, PNG, etc.)
 * @param options - Enhancement options (defaults to minimal processing)
 * @returns Promise resolving to enhancement result with processed buffer and metadata
 * @throws Error if image buffer is invalid or processing fails
 */
export async function enhancePhoto(
  imageBuffer: Buffer,
  options: EnhancementOptions = {},
): Promise<EnhancementResult> {
  const startTime = performance.now();
  const appliedEnhancements: AppliedEnhancement[] = [];

  // Validate input
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Invalid image buffer: buffer is empty or undefined');
  }

  // Initialize Sharp pipeline
  let pipeline = sharp(imageBuffer);

  // Get input metadata
  const inputMetadata = await pipeline.metadata();
  const inputFormat = inputMetadata.format || 'unknown';

  // Track original dimensions
  let currentWidth = inputMetadata.width || 0;
  let currentHeight = inputMetadata.height || 0;

  // Apply rotation if specified (and not zero)
  if (options.rotation !== undefined && options.rotation !== 0) {
    pipeline = pipeline.rotate(options.rotation, {
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });

    appliedEnhancements.push({
      type: 'rotation',
      description: `Rotated image by ${options.rotation} degrees`,
      parameters: { degrees: options.rotation },
    });

    // Update dimensions for 90/270 degree rotations
    if (Math.abs(options.rotation) === 90 || Math.abs(options.rotation) === 270) {
      [currentWidth, currentHeight] = [currentHeight, currentWidth];
    } else if (options.rotation % 90 !== 0) {
      // An arbitrary angle enlarges the canvas and fills the corners with the
      // background. Render the rotation to learn the canvas size sharp
      // produced, then crop to the rectangle inscribed in the rotated image.
      let rotated: { data: Buffer; info: sharp.OutputInfo };
      try {
        rotated = await pipeline.raw().toBuffer({ resolveWithObject: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Image processing failed: ${errorMessage}`);
      }
      const { info } = rotated;
      const inscribed = inscribedRectangle(currentWidth, currentHeight, options.rotation);
      const width = Math.max(1, Math.floor(inscribed.width) - 2 * INSCRIBED_MARGIN_PX);
      const height = Math.max(1, Math.floor(inscribed.height) - 2 * INSCRIBED_MARGIN_PX);
      const left = Math.max(0, Math.floor((info.width - width) / 2));
      const top = Math.max(0, Math.floor((info.height - height) / 2));

      pipeline = sharp(rotated.data, {
        raw: { width: info.width, height: info.height, channels: info.channels },
      }).extract({ left, top, width, height });

      appliedEnhancements.push({
        type: 'crop',
        description: `Cropped to ${width}x${height} to remove the corners left by rotation`,
        parameters: { left, top, width, height },
      });

      currentWidth = width;
      currentHeight = height;
    }
  }

  // Apply normalization and/or white balance
  // Note: Both use Sharp's normalize(), so we only apply once
  const shouldNormalize = options.normalize || options.whiteBalance;

  if (shouldNormalize) {
    pipeline = pipeline.normalize();

    if (options.whiteBalance) {
      appliedEnhancements.push({
        type: 'whiteBalance',
        description: 'Applied automatic white balance correction',
        parameters: { method: 'normalize' },
      });
    }

    if (options.normalize) {
      appliedEnhancements.push({
        type: 'normalize',
        description: 'Normalized contrast and brightness',
        parameters: {},
      });
    }
  }

  // Apply gamma correction
  if (options.gamma !== undefined && options.gamma > 0) {
    pipeline = pipeline.gamma(options.gamma);

    appliedEnhancements.push({
      type: 'gamma',
      description: `Applied gamma correction (γ=${options.gamma})`,
      parameters: { gamma: options.gamma },
    });
  }

  // Apply sharpening
  if (options.sharpen) {
    const sharpenParams = resolveSharpenParams(options.sharpen);
    pipeline = pipeline.sharpen(sharpenParams);

    appliedEnhancements.push({
      type: 'sharpen',
      description: 'Applied sharpening filter',
      parameters: sharpenParams,
    });
  }

  // Convert to high-quality JPEG for storage
  pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

  appliedEnhancements.push({
    type: 'format',
    description: `Converted to JPEG (quality: ${JPEG_QUALITY})`,
    parameters: { quality: JPEG_QUALITY, format: 'jpeg' },
  });

  // Execute pipeline
  let buffer: Buffer;
  try {
    buffer = await pipeline.toBuffer();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Image processing failed: ${errorMessage}`);
  }

  // Get final dimensions (important for rotated images)
  const finalMetadata = await sharp(buffer).metadata();
  const finalWidth = finalMetadata.width || currentWidth;
  const finalHeight = finalMetadata.height || currentHeight;

  const processingTime = performance.now() - startTime;

  return {
    buffer,
    appliedEnhancements,
    processingTime,
    inputFormat,
    outputFormat: 'jpeg',
    dimensions: {
      width: finalWidth,
      height: finalHeight,
    },
  };
}
