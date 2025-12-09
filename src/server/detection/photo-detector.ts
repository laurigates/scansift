/**
 * Photo detection algorithm using Sharp.
 * Detects 1-4 photos using edge detection to find photo boundaries.
 */

import sharp from 'sharp';
import type { DetectedPhoto, DetectionResult, GridPosition } from '@/shared/types';

// Valid DPI values for scanning
const VALID_DPI_VALUES = [100, 150, 200, 300, 600, 1200];

// Minimum photo size in inches (2" x 2")
const MIN_PHOTO_SIZE_INCHES = 2;

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detect photos in a scanned image using edge detection.
 */
export async function detectPhotos(imageBuffer: Buffer, dpi: number): Promise<DetectionResult> {
  const startTime = performance.now();
  const warnings: string[] = [];

  // Validate DPI
  if (!VALID_DPI_VALUES.includes(dpi)) {
    throw new Error(`Invalid DPI: ${dpi}. Supported values: ${VALID_DPI_VALUES.join(', ')}`);
  }

  const minPhotoSizePx = MIN_PHOTO_SIZE_INCHES * dpi;

  try {
    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width === 0 || height === 0) {
      throw new Error('Invalid image dimensions');
    }

    // Apply edge detection using Sobel operator via Sharp's convolve
    // Then analyze the result to find photo boundaries
    const { data: edgeData } = await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1], // Sobel X
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data: edgeDataY } = await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1], // Sobel Y
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Combine edge magnitudes
    const edgeDataArray =
      edgeData instanceof Uint8Array ? edgeData : new Uint8Array(edgeData as Buffer);
    const edgeDataYArray =
      edgeDataY instanceof Uint8Array ? edgeDataY : new Uint8Array(edgeDataY as Buffer);
    const edges = new Uint8Array(edgeDataArray.length);
    for (let i = 0; i < edges.length; i++) {
      const gx = (edgeDataArray[i] ?? 0) - 128; // Center around 0
      const gy = (edgeDataYArray[i] ?? 0) - 128;
      edges[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }

    // Find horizontal and vertical edge lines (projection profile method)
    const horizontalProfile = new Float32Array(height);
    const verticalProfile = new Float32Array(width);

    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = 0; x < width; x++) {
        sum += edges[y * width + x] ?? 0;
      }
      horizontalProfile[y] = sum / width;
    }

    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = 0; y < height; y++) {
        sum += edges[y * width + x] ?? 0;
      }
      verticalProfile[x] = sum / height;
    }

    // Find peaks in profiles (potential photo edges)
    const minGap = Math.floor(minPhotoSizePx * 0.5); // At least half photo size gap
    const horizontalEdges = findProfilePeaks(horizontalProfile, minGap);
    const verticalEdges = findProfilePeaks(verticalProfile, minGap);

    // Create regions from edge combinations
    const regions = createRegionsFromEdges(
      horizontalEdges,
      verticalEdges,
      width,
      height,
      minPhotoSizePx,
    );

    if (regions.length === 0) {
      warnings.push('No photos detected - try adjusting photo placement');
    }

    // Take up to 4 largest regions
    regions.sort((a, b) => b.width * b.height - a.width * a.height);
    const topRegions = regions.slice(0, 4);

    // Assign grid positions
    const photos = assignGridPositions(topRegions, width, height);

    const processingTime = Math.round(performance.now() - startTime);

    return {
      photos,
      processingTime,
      warnings,
    };
  } catch (error) {
    throw new Error(
      `Photo detection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Find significant peaks in a projection profile.
 */
function findProfilePeaks(profile: Float32Array, minDistance: number): number[] {
  // Calculate threshold (mean + 1 stddev)
  let sum = 0;
  for (const val of profile) sum += val;
  const mean = sum / profile.length;

  let variance = 0;
  for (const val of profile) variance += (val - mean) ** 2;
  const stdDev = Math.sqrt(variance / profile.length);

  const threshold = mean + stdDev;

  // Find peaks above threshold
  const peaks: Array<{ pos: number; val: number }> = [];

  for (let i = 1; i < profile.length - 1; i++) {
    const val = profile[i] ?? 0;
    const prevVal = profile[i - 1] ?? 0;
    const nextVal = profile[i + 1] ?? 0;
    if (val > threshold && val > prevVal && val >= nextVal) {
      peaks.push({ pos: i, val });
    }
  }

  // Sort by value and filter by minimum distance
  peaks.sort((a, b) => b.val - a.val);

  const selectedPeaks: number[] = [];
  for (const peak of peaks) {
    let tooClose = false;
    for (const selected of selectedPeaks) {
      if (Math.abs(peak.pos - selected) < minDistance) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selectedPeaks.push(peak.pos);
    }
  }

  selectedPeaks.sort((a, b) => a - b);
  return selectedPeaks;
}

/**
 * Create rectangular regions from detected edge positions.
 */
function createRegionsFromEdges(
  hEdges: number[],
  vEdges: number[],
  width: number,
  height: number,
  minSize: number,
): Region[] {
  // Add image boundaries
  const hBounds = [0, ...hEdges, height];
  const vBounds = [0, ...vEdges, width];

  const regions: Region[] = [];

  // Create regions from all combinations of horizontal and vertical edges
  for (let i = 0; i < hBounds.length - 1; i++) {
    for (let j = 0; j < vBounds.length - 1; j++) {
      const y = hBounds[i] ?? 0;
      const y2 = hBounds[i + 1] ?? 0;
      const x = vBounds[j] ?? 0;
      const x2 = vBounds[j + 1] ?? 0;

      const regionWidth = x2 - x;
      const regionHeight = y2 - y;

      // Filter by minimum size
      if (regionWidth >= minSize && regionHeight >= minSize) {
        regions.push({
          x,
          y,
          width: regionWidth,
          height: regionHeight,
        });
      }
    }
  }

  return regions;
}

/**
 * Assign grid positions to detected photos.
 */
function assignGridPositions(
  regions: Region[],
  imageWidth: number,
  imageHeight: number,
): DetectedPhoto[] {
  if (regions.length === 0) {
    return [];
  }

  const midX = imageWidth / 2;
  const midY = imageHeight / 2;

  const photos: DetectedPhoto[] = regions.map((region) => {
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;

    const isLeft = centerX < midX;
    const isTop = centerY < midY;

    let position: GridPosition;
    if (isTop && isLeft) {
      position = 'top-left';
    } else if (isTop && !isLeft) {
      position = 'top-right';
    } else if (!isTop && isLeft) {
      position = 'bottom-left';
    } else {
      position = 'bottom-right';
    }

    const aspectRatio = region.width / region.height;
    const confidence = aspectRatio > 0.5 && aspectRatio < 2.0 ? 0.8 : 0.6;

    return {
      image: Buffer.alloc(0),
      position,
      bounds: region,
      confidence,
    };
  });

  const positionOrder: GridPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

  photos.sort((a, b) => {
    return positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position);
  });

  return photos;
}
