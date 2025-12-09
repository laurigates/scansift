/**
 * Photo pairing logic for matching front and back scans.
 * Pairs photos by grid position - same position fronts and backs are paired together.
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

import type { CroppedPhoto, GridPosition, PairingResult, PhotoPair } from '../../shared/types';

/**
 * Canonical order for grid positions.
 * Used to ensure consistent ordering of paired photos.
 */
const POSITION_ORDER: GridPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Pair front photos with their corresponding back photos by grid position.
 *
 * Pairing rules:
 * - Primary matching: By exact grid position (top-left front pairs with top-left back)
 * - Missing backs: Create pairs with back=undefined if no matching back found
 * - Extra backs: Ignored with warning if no matching front exists
 * - Position validation: Checks for duplicates and logs warnings
 *
 * @param fronts - Array of front photos (must not be empty)
 * @param backs - Array of back photos (can be empty)
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
export function pairPhotos(fronts: CroppedPhoto[], backs: CroppedPhoto[]): PairingResult {
  // Validate inputs
  if (!fronts || fronts.length === 0) {
    throw new Error('Cannot pair photos: fronts array must not be empty');
  }

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

  // Check for duplicate positions in backs
  for (const [position, backsAtPosition] of backsByPosition.entries()) {
    if (backsAtPosition.length > 1) {
      warnings.push(
        `Duplicate back photos found at position ${position} (${backsAtPosition.length} photos). Using first occurrence.`,
      );
    }
  }

  // Log count differences
  if (fronts.length !== backs.length) {
    warnings.push(`Photo count mismatch: ${fronts.length} fronts vs ${backs.length} backs`);
  }

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

    const backsAtPosition = backsByPosition.get(position);

    // Use first front if duplicates exist (guaranteed to exist based on loop logic)
    const front = frontsAtPosition[0];

    // Use first back if duplicates exist, or undefined if no back
    const back = backsAtPosition?.[0];

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
  for (const position of backsByPosition.keys()) {
    if (!frontsByPosition.has(position)) {
      extraBackPositions.push(position);
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
  console.log('Photo pairing statistics:');
  console.log(`  Total pairs: ${pairs.length}`);
  console.log(`  Matched (front + back): ${matched}`);
  console.log(`  Unmatched (front only): ${unmatched}`);
  console.log(`  Extra backs ignored: ${extraBackPositions.length}`);

  if (warnings.length > 0) {
    console.log('Pairing warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  return {
    pairs,
    warnings,
  };
}
