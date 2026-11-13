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

    // Decode to raw greyscale once. The Sobel magnitude is computed here rather
    // than with Sharp's convolve, whose 8-bit output clamps negative responses
    // to 0 and so reports only one edge polarity per kernel.
    const { data: grayData, info } = await sharp(imageBuffer)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gray =
      info.channels === 1 ? grayData : grayData.filter((_, i) => i % info.channels === 0);
    const edges = sobelMagnitude(gray, width, height);

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
    ).filter((region) => hasPhotoContent(gray, width, height, region));

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
      imageDimensions: { width, height },
    };
  } catch (error) {
    throw new Error(
      `Photo detection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Sobel gradient magnitude (|gx| + |gy|, clamped to 255) of a greyscale image.
 * Both edge polarities contribute; border pixels are left at 0.
 */
function sobelMagnitude(gray: Uint8Array, width: number, height: number): Uint8Array {
  const edges = new Uint8Array(width * height);
  const at = (i: number): number => gray[i] ?? 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const up = i - width;
      const down = i + width;
      const gx =
        at(up + 1) + 2 * at(i + 1) + at(down + 1) - at(up - 1) - 2 * at(i - 1) - at(down - 1);
      const gy = at(down - 1) + 2 * at(down) + at(down + 1) - at(up - 1) - 2 * at(up) - at(up + 1);
      edges[i] = Math.min(255, Math.abs(gx) + Math.abs(gy));
    }
  }

  return edges;
}

// Grey-level distance from the page background above which a pixel counts as photo content
const CONTENT_GRAY_DELTA = 25;

// Fraction of a region that must be content for the region to count as a photo
const MIN_CONTENT_FRACTION = 0.5;

// Regions and the page border are sampled on a grid of roughly this many steps per side
const CONTENT_SAMPLE_STEPS = 64;

/**
 * Estimate the page background as the median grey level along the image border.
 */
function borderMedian(gray: Uint8Array, width: number, height: number): number {
  const samples: number[] = [];
  const stepX = Math.max(1, Math.floor(width / CONTENT_SAMPLE_STEPS));
  const stepY = Math.max(1, Math.floor(height / CONTENT_SAMPLE_STEPS));

  for (let x = 0; x < width; x += stepX) {
    samples.push(gray[x] ?? 0, gray[(height - 1) * width + x] ?? 0);
  }
  for (let y = 0; y < height; y += stepY) {
    samples.push(gray[y * width] ?? 0, gray[y * width + width - 1] ?? 0);
  }

  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

/**
 * Whether a candidate region holds a photo rather than empty scanner bed:
 * at least half of its sampled pixels differ from the page background.
 */
function hasPhotoContent(gray: Uint8Array, width: number, height: number, region: Region): boolean {
  const background = borderMedian(gray, width, height);
  const stepX = Math.max(1, Math.floor(region.width / CONTENT_SAMPLE_STEPS));
  const stepY = Math.max(1, Math.floor(region.height / CONTENT_SAMPLE_STEPS));

  let total = 0;
  let content = 0;
  for (let y = region.y; y < region.y + region.height; y += stepY) {
    for (let x = region.x; x < region.x + region.width; x += stepX) {
      total++;
      if (Math.abs((gray[y * width + x] ?? 0) - background) > CONTENT_GRAY_DELTA) {
        content++;
      }
    }
  }

  return total > 0 && content / total >= MIN_CONTENT_FRACTION;
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

const POSITION_ORDER: GridPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

// A centre within this fraction of the page size from a midline counts as on it,
// so a centred photo does not change quadrant on a one-pixel edge shift.
const MIDLINE_TOLERANCE = 0.01;

/**
 * Assign grid positions to detected photos. Each position is used at most once:
 * the region nearest a quadrant's centre claims it, and a region whose own
 * quadrant is taken gets the free quadrant nearest its centre.
 * A centre on a midline counts as top / left.
 */
function assignGridPositions(
  regions: Region[],
  imageWidth: number,
  imageHeight: number,
): DetectedPhoto[] {
  const midX = imageWidth / 2;
  const midY = imageHeight / 2;
  const free = new Set<GridPosition>(POSITION_ORDER);

  const quadrantCentre = (position: GridPosition): { x: number; y: number } => ({
    x: position.endsWith('left') ? imageWidth / 4 : (imageWidth * 3) / 4,
    y: position.startsWith('top') ? imageHeight / 4 : (imageHeight * 3) / 4,
  });

  const distanceTo = (position: GridPosition, x: number, y: number): number => {
    const centre = quadrantCentre(position);
    return (centre.x - x) ** 2 + (centre.y - y) ** 2;
  };

  // The region closest to a quadrant's centre claims it first
  const candidates = regions
    .map((region) => {
      const centerX = region.x + region.width / 2;
      const centerY = region.y + region.height / 2;
      const isLeft = centerX <= midX + imageWidth * MIDLINE_TOLERANCE;
      const isTop = centerY <= midY + imageHeight * MIDLINE_TOLERANCE;
      const preferred: GridPosition = `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`;
      return { region, centerX, centerY, preferred };
    })
    .sort(
      (a, b) =>
        distanceTo(a.preferred, a.centerX, a.centerY) -
        distanceTo(b.preferred, b.centerX, b.centerY),
    );

  const photos: DetectedPhoto[] = [];

  for (const { region, centerX, centerY, preferred } of candidates) {
    let position: GridPosition | undefined = free.has(preferred) ? preferred : undefined;
    if (!position) {
      let best = Number.POSITIVE_INFINITY;
      for (const candidate of free) {
        const distance = distanceTo(candidate, centerX, centerY);
        if (distance < best) {
          best = distance;
          position = candidate;
        }
      }
    }
    if (!position) break; // more regions than grid slots
    free.delete(position);

    const aspectRatio = region.width / region.height;
    const confidence = aspectRatio > 0.5 && aspectRatio < 2.0 ? 0.8 : 0.6;

    photos.push({
      image: Buffer.alloc(0),
      position,
      bounds: region,
      confidence,
    });
  }

  photos.sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position));

  return photos;
}
