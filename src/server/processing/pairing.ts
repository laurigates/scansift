/**
 * Photo pairing logic for matching front and back scans.
 * Pairs photos by grid position - same position fronts and backs are paired together.
 * When the dimensions of both scans are known, a back whose centre lies within
 * the position tolerance of a front pairs with it even if it landed in another
 * grid cell (FR-3.2).
 *
 * @example
 * ```typescript
 * const fronts: CroppedPhoto[] = [
 *   { image: frontBuffer1, position: 'top-left', ... },
 *   { image: frontBuffer2, position: 'top-right', ... }
 * ];
 *
 * const backs: CroppedPhoto[] = [
 *   { image: backBuffer1, position: 'top-left', ... },
 *   { image: backBuffer2, position: 'top-right', ... }
 * ];
 *
 * const result = pairPhotos(fronts, backs);
 * // result.pairs contains matched fronts with their backs
 * // result.warnings lists any mismatches or issues
 * ```
 *
 * @module pairing
 */

import { PAIRING_CONFIG } from '../../shared/constants';
import type {
  CroppedPhoto,
  GridPosition,
  ImageDimensions,
  PairingResult,
  PhotoPair,
} from '../../shared/types';
import { logger } from '../logger';

/**
 * Options for pairPhotos.
 */
export interface PairingOptions {
  /** Dimensions of the front scan that the fronts' bounds are measured in */
  frontDimensions?: ImageDimensions;
  /** Dimensions of the back scan that the backs' bounds are measured in */
  backDimensions?: ImageDimensions;
  /**
   * Largest centre shift that still pairs, per axis, as a fraction of the scan
   * width/height. Defaults to PAIRING_CONFIG.POSITION_TOLERANCE.
   */
  tolerance?: number;
}

/** Absorbs floating-point error so a shift of exactly the tolerance pairs. */
const TOLERANCE_EPSILON = 1e-9;

/**
 * Canonical order for grid positions.
 * Used to ensure consistent ordering of paired photos.
 */
const POSITION_ORDER: GridPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

const hasArea = (dimensions: ImageDimensions | undefined): dimensions is ImageDimensions =>
  dimensions !== undefined && dimensions.width > 0 && dimensions.height > 0;

/**
 * Centre of a photo's bounds as fractions (0..1) of the scan it was found in.
 */
const normalisedCentre = (photo: CroppedPhoto, scan: ImageDimensions) => ({
  x: (photo.bounds.x + photo.bounds.width / 2) / scan.width,
  y: (photo.bounds.y + photo.bounds.height / 2) / scan.height,
});

/**
 * Match fronts to backs by centre distance.
 *
 * A front and a back are candidates when their normalised centres differ by at
 * most `tolerance` on both axes. Candidates are taken nearest first, each front
 * and each back at most once.
 *
 * @returns Index into `backs` of the matched back, keyed by front
 */
function matchByCentre(
  fronts: CroppedPhoto[],
  backs: CroppedPhoto[],
  frontDimensions: ImageDimensions,
  backDimensions: ImageDimensions,
  tolerance: number,
): Map<CroppedPhoto, number> {
  const limit = tolerance + TOLERANCE_EPSILON;
  const backCentres = backs.map((back) => normalisedCentre(back, backDimensions));

  const candidates = fronts.flatMap((front) => {
    const centre = normalisedCentre(front, frontDimensions);
    return backCentres
      .map((backCentre, backIndex) => ({
        front,
        backIndex,
        dx: Math.abs(backCentre.x - centre.x),
        dy: Math.abs(backCentre.y - centre.y),
      }))
      .filter(({ dx, dy }) => dx <= limit && dy <= limit);
  });
  candidates.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));

  const matches = new Map<CroppedPhoto, number>();
  const usedBacks = new Set<number>();
  for (const { front, backIndex } of candidates) {
    if (matches.has(front) || usedBacks.has(backIndex)) {
      continue;
    }
    matches.set(front, backIndex);
    usedBacks.add(backIndex);
  }
  return matches;
}

/**
 * Pair front photos with their corresponding back photos by grid position.
 *
 * Pairing rules:
 * - Position tolerance: when both scan dimensions are given, a front first takes
 *   the nearest unused back whose centre is within `tolerance` of its own on
 *   both axes, whatever grid position that back was labelled with
 * - Grid matching: a front left without a back takes the first unused back at
 *   its exact grid position (top-left front pairs with top-left back). This is
 *   the only rule when either scan's dimensions are missing
 * - Missing backs: Create pairs with back=undefined if no matching back found
 * - Extra backs: Ignored with warning if no matching front exists
 * - Position validation: Checks for duplicates and logs warnings
 *
 * @param fronts - Array of front photos (must not be empty)
 * @param backs - Array of back photos (can be empty)
 * @param options - Scan dimensions and tolerance for position-tolerant pairing
 * @returns PairingResult with pairs and warnings
 * @throws Error if fronts array is empty
 *
 * @example
 * // Perfect matching
 * const result = pairPhotos(
 *   [front1, front2],
 *   [back1, back2]
 * );
 * // result.pairs.length === 2, result.warnings.length === 0
 *
 * @example
 * // Missing backs
 * const result = pairPhotos(
 *   [front1, front2, front3],
 *   [back1]
 * );
 * // result.pairs.length === 3
 * // Only first pair has back, others have back=undefined
 */
export function pairPhotos(
  fronts: CroppedPhoto[],
  backs: CroppedPhoto[],
  options: PairingOptions = {},
): PairingResult {
  // Validate inputs
  if (!fronts || fronts.length === 0) {
    throw new Error('Cannot pair photos: fronts array must not be empty');
  }

  const { frontDimensions, backDimensions } = options;
  const tolerance = options.tolerance ?? PAIRING_CONFIG.POSITION_TOLERANCE;
  const byCentre = hasArea(frontDimensions) && hasArea(backDimensions);

  const warnings: string[] = [];
  const pairs: PhotoPair[] = [];

  // Create position maps for efficient lookup
  const frontsByPosition = new Map<GridPosition, CroppedPhoto[]>();
  const backsByPosition = new Map<GridPosition, CroppedPhoto[]>();

  // Group fronts by position
  for (const front of fronts) {
    const existing = frontsByPosition.get(front.position) || [];
    existing.push(front);
    frontsByPosition.set(front.position, existing);
  }

  // Group backs by position
  for (const back of backs) {
    const existing = backsByPosition.get(back.position) || [];
    existing.push(back);
    backsByPosition.set(back.position, existing);
  }

  // Check for duplicate positions in fronts
  for (const [position, frontsAtPosition] of frontsByPosition.entries()) {
    if (frontsAtPosition.length > 1) {
      warnings.push(
        `Duplicate front photos found at position ${position} (${frontsAtPosition.length} photos). Using first occurrence.`,
      );
    }
  }

  // Check for duplicate positions in backs. With centre matching, two backs
  // in one grid cell can both pair, so any left over are reported as extras.
  for (const [position, backsAtPosition] of backsByPosition.entries()) {
    if (!byCentre && backsAtPosition.length > 1) {
      warnings.push(
        `Duplicate back photos found at position ${position} (${backsAtPosition.length} photos). Using first occurrence.`,
      );
    }
  }

  // Log count differences
  if (fronts.length !== backs.length) {
    warnings.push(`Photo count mismatch: ${fronts.length} fronts vs ${backs.length} backs`);
  }

  // Match by centre first; backs are tracked by index into `backs`
  const centreMatches = byCentre
    ? matchByCentre(
        POSITION_ORDER.flatMap((position) => frontsByPosition.get(position)?.slice(0, 1) ?? []),
        backs,
        frontDimensions,
        backDimensions,
        tolerance,
      )
    : new Map<CroppedPhoto, number>();
  const usedBacks = new Set(centreMatches.values());

  // Create pairs in canonical order
  const positionsWithFronts = new Set(frontsByPosition.keys());

  for (const position of POSITION_ORDER) {
    if (!positionsWithFronts.has(position)) {
      continue; // No front at this position, skip
    }

    const frontsAtPosition = frontsByPosition.get(position);
    if (!frontsAtPosition) {
      continue;
    }

    // Use first front if duplicates exist (guaranteed to exist based on loop logic)
    const front = frontsAtPosition[0];
    if (!front) {
      continue; // Should never happen, but satisfies TypeScript
    }

    // Use the centre match, else the first unused back at this grid position
    // (the first one if duplicates exist), or undefined if no back
    let backIndex = centreMatches.get(front);
    if (backIndex === undefined) {
      const gridIndex = backs.findIndex(
        (candidate, index) => candidate.position === position && !usedBacks.has(index),
      );
      if (gridIndex !== -1) {
        backIndex = gridIndex;
        usedBacks.add(gridIndex);
      }
    }
    const back = backIndex === undefined ? undefined : backs[backIndex];

    const pair: PhotoPair = {
      front,
      position,
    };
    if (back) {
      pair.back = back;
    }
    pairs.push(pair);
  }

  // Check for extra backs without matching fronts
  const extraBackPositions: GridPosition[] = [];
  if (byCentre) {
    for (const [index, back] of backs.entries()) {
      if (!usedBacks.has(index) && !extraBackPositions.includes(back.position)) {
        extraBackPositions.push(back.position);
      }
    }
  } else {
    for (const position of backsByPosition.keys()) {
      if (!frontsByPosition.has(position)) {
        extraBackPositions.push(position);
      }
    }
  }

  if (extraBackPositions.length > 0) {
    warnings.push(
      `Extra back photos without matching fronts at positions: ${extraBackPositions.join(', ')}`,
    );
  }

  // Count matched and unmatched for statistics
  const matched = pairs.filter((p) => p.back !== undefined).length;
  const unmatched = pairs.filter((p) => p.back === undefined).length;

  // Log pairing statistics
  logger.info(
    {
      totalPairs: pairs.length,
      matched,
      unmatched,
      extraBacksIgnored: extraBackPositions.length,
    },
    'Photo pairing statistics',
  );

  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Pairing warnings');
  }

  return {
    pairs,
    warnings,
  };
}
