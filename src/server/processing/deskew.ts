/**
 * Skew angle estimation for cropped photos.
 *
 * A photo laid straight on the flatbed has its outline along the pixel rows
 * and columns, so the edge energy summed per row and per column has sharp
 * peaks where the outline is. Rotating the photo smears those peaks out. The
 * estimator searches for the rotation that makes the projection profiles of
 * the edge map most sharply peaked.
 *
 * @module deskew
 */

import sharp from 'sharp';

/** Longest side of the greyscale working copy, in pixels. */
const ANALYSIS_SIZE = 400;

/** Largest skew searched for, in degrees either side of straight. */
export const MAX_SKEW_DEGREES = 10;

const COARSE_STEP_DEGREES = 0.5;
const FINE_STEP_DEGREES = 0.1;

/** Gradient magnitude (0-510) below which a pixel is not counted as an edge. */
const EDGE_THRESHOLD = 24;

/** Edge pixels needed before an estimate is attempted. */
const MIN_EDGE_PIXELS = 50;

/**
 * How far the best candidate's score must exceed the score at 0 degrees
 * before the image is treated as skewed.
 */
const MIN_STRAIGHT_RATIO = 1.5;

/**
 * How far the best candidate's score must exceed the median score over the
 * search range. An outline inside the range gives a narrow peak (12x the
 * median or more on the synthetic scans in tests/processing/deskew.test.ts);
 * a skew outside the range gives a slope that rises towards one end of it
 * (2x the median for a 30 degree skew).
 */
const MIN_PEAK_RATIO = 4;

interface EdgePoints {
  /** Coordinates relative to the image centre. */
  xs: Float32Array;
  ys: Float32Array;
  weights: Float32Array;
  count: number;
  /** Bins needed to hold any projection of the image. */
  bins: number;
}

/**
 * Collect edge pixels from a greyscale buffer using central differences.
 * The differences are taken on the raw samples, so the gradient is signed
 * correctly and a flat area scores 0.
 */
function collectEdgePoints(data: Buffer, width: number, height: number): EdgePoints {
  const capacity = width * height;
  const xs = new Float32Array(capacity);
  const ys = new Float32Array(capacity);
  const weights = new Float32Array(capacity);
  let count = 0;

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const gx = (data[i + 1] ?? 0) - (data[i - 1] ?? 0);
      const gy = (data[i + width] ?? 0) - (data[i - width] ?? 0);
      const magnitude = Math.abs(gx) + Math.abs(gy);
      if (magnitude >= EDGE_THRESHOLD) {
        xs[count] = x - cx;
        ys[count] = y - cy;
        weights[count] = magnitude;
        count++;
      }
    }
  }

  return { xs, ys, weights, count, bins: Math.ceil(Math.hypot(width, height)) + 2 };
}

/**
 * Score a candidate rotation: the sum of squared differences between adjacent
 * bins of the row and column projection profiles of the edge points after
 * rotating them clockwise by `degrees`.
 *
 * Adjacent-bin differences are used instead of the profile variance because
 * textured photo content contributes a broad profile whose variance barely
 * changes with the angle and outweighs the outline; a straight outline puts
 * its whole length into one or two bins, which the differences pick out.
 */
function scoreRotation(edges: EdgePoints, degrees: number): number {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rows = new Float64Array(edges.bins);
  const cols = new Float64Array(edges.bins);
  const offset = edges.bins / 2;

  for (let i = 0; i < edges.count; i++) {
    const x = edges.xs[i] ?? 0;
    const y = edges.ys[i] ?? 0;
    const weight = edges.weights[i] ?? 0;
    // Image coordinates have y pointing down, so this is a clockwise rotation,
    // matching the direction sharp's rotate() uses for positive angles.
    const col = Math.round(x * cos - y * sin + offset);
    const row = Math.round(x * sin + y * cos + offset);
    cols[col] = (cols[col] ?? 0) + weight;
    rows[row] = (rows[row] ?? 0) + weight;
  }

  let score = 0;
  for (let i = 1; i < edges.bins; i++) {
    const r = (rows[i] ?? 0) - (rows[i - 1] ?? 0);
    const c = (cols[i] ?? 0) - (cols[i - 1] ?? 0);
    score += r * r + c * c;
  }
  return score;
}

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

/**
 * Estimate how far an image is skewed.
 *
 * @param image - Encoded image buffer (JPEG, PNG, etc.)
 * @returns Degrees to rotate the image by to straighten it, in the convention
 *   of sharp's `rotate()` (positive is clockwise), to 0.1 degree. Returns 0
 *   when there is no confident estimate: too few edges, no candidate clearly
 *   better than leaving the image as it is, or no narrow peak inside the
 *   search range (the true skew is then probably outside it).
 * @throws Error if the buffer is empty or cannot be decoded
 */
export async function estimateSkewAngle(image: Buffer): Promise<number> {
  if (!image || image.length === 0) {
    throw new Error('Invalid image buffer: buffer is empty or undefined');
  }

  const { data, info } = await sharp(image)
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const edges = collectEdgePoints(data, info.width, info.height);
  if (edges.count < MIN_EDGE_PIXELS) {
    return 0;
  }

  // Coarse pass over the whole range. Index coarseSteps is 0 degrees.
  const coarseSteps = Math.round(MAX_SKEW_DEGREES / COARSE_STEP_DEGREES);
  const coarseScores: number[] = [];
  for (let step = -coarseSteps; step <= coarseSteps; step++) {
    coarseScores.push(scoreRotation(edges, step * COARSE_STEP_DEGREES));
  }

  const straightScore = coarseScores[coarseSteps] ?? 0;
  let bestAngle = 0;
  let bestScore = straightScore;
  coarseScores.forEach((score, index) => {
    if (score > bestScore) {
      bestScore = score;
      bestAngle = (index - coarseSteps) * COARSE_STEP_DEGREES;
    }
  });

  if (bestAngle === 0) {
    return 0;
  }

  // Fine pass around the coarse winner.
  const coarseAngle = bestAngle;
  const fineSteps = Math.round(COARSE_STEP_DEGREES / FINE_STEP_DEGREES) - 1;
  for (let step = -fineSteps; step <= fineSteps; step++) {
    const angle = roundToTenth(coarseAngle + step * FINE_STEP_DEGREES);
    const score = scoreRotation(edges, angle);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  const sortedScores = [...coarseScores].sort((a, b) => a - b);
  const medianScore = sortedScores[Math.floor(sortedScores.length / 2)] ?? 0;
  const isPeak = bestScore >= medianScore * MIN_PEAK_RATIO;
  const beatsStraight = bestScore >= straightScore * MIN_STRAIGHT_RATIO;

  return isPeak && beatsStraight ? bestAngle : 0;
}
