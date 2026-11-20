/**
 * Tests for photo pairing logic.
 * Following TDD principles - these tests should fail initially.
 */

import { describe, expect, test } from 'bun:test';
import { pairPhotos } from '../../src/server/processing/pairing';
import type { CroppedPhoto, GridPosition } from '../../src/shared/types';

// Helper function to create test photos
function createTestPhoto(position: GridPosition): CroppedPhoto {
  return {
    image: Buffer.from(`test-image-${position}`),
    position,
    bounds: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
    originalBounds: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
  };
}

describe('pairPhotos', () => {
  describe('Basic pairing', () => {
    test('should pair fronts with matching backs by position', () => {
      const fronts: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
        createTestPhoto('bottom-right'),
      ];

      const backs: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
        createTestPhoto('bottom-right'),
      ];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(4);
      expect(result.warnings).toHaveLength(0);

      // Verify each pair has correct position
      for (const pair of result.pairs) {
        expect(pair.front.position).toBe(pair.position);
        expect(pair.back).toBeDefined();
        expect(pair.back?.position).toBe(pair.position);
      }
    });

    test('should create pairs in consistent order', () => {
      const fronts: CroppedPhoto[] = [
        createTestPhoto('bottom-right'),
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
      ];

      const backs: CroppedPhoto[] = [
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
        createTestPhoto('top-left'),
        createTestPhoto('bottom-right'),
      ];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(4);

      // Should be ordered by grid position
      const positions = result.pairs.map((p) => p.position);
      expect(positions).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    });
  });

  describe('Missing backs', () => {
    test('should handle missing backs gracefully', () => {
      const fronts: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
        createTestPhoto('bottom-right'),
      ];

      const backs: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('bottom-left')];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(4);
      expect(result.warnings.length).toBeGreaterThan(0);

      // Find pairs without backs
      const topLeftPair = result.pairs.find((p) => p.position === 'top-left');
      expect(topLeftPair?.back).toBeDefined();

      const topRightPair = result.pairs.find((p) => p.position === 'top-right');
      expect(topRightPair?.back).toBeUndefined();

      const bottomLeftPair = result.pairs.find((p) => p.position === 'bottom-left');
      expect(bottomLeftPair?.back).toBeDefined();

      const bottomRightPair = result.pairs.find((p) => p.position === 'bottom-right');
      expect(bottomRightPair?.back).toBeUndefined();
    });

    test('should warn when back count differs from front count', () => {
      const fronts: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
      ];

      const backs: CroppedPhoto[] = [createTestPhoto('top-left')];

      const result = pairPhotos(fronts, backs);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('count'))).toBe(true);
    });

    test('should handle empty backs array', () => {
      const fronts: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('top-right')];

      const backs: CroppedPhoto[] = [];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(2);
      expect(result.pairs.every((p) => p.back === undefined)).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Extra backs', () => {
    test('should ignore extra backs without matching fronts', () => {
      const fronts: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('top-right')];

      const backs: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
        createTestPhoto('bottom-right'),
      ];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(2);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('extra') || w.includes('Extra'))).toBe(true);
    });

    test('should warn about specific positions with extra backs', () => {
      const fronts: CroppedPhoto[] = [createTestPhoto('top-left')];

      const backs: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('bottom-right')];

      const result = pairPhotos(fronts, backs);

      expect(result.warnings.some((w) => w.includes('bottom-right'))).toBe(true);
    });
  });

  describe('Validation', () => {
    test('should reject empty fronts array', () => {
      const fronts: CroppedPhoto[] = [];
      const backs: CroppedPhoto[] = [createTestPhoto('top-left')];

      expect(() => pairPhotos(fronts, backs)).toThrow();
    });

    test('should handle duplicate positions in fronts', () => {
      const fronts: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-left'), // Duplicate
        createTestPhoto('top-right'),
      ];

      const backs: CroppedPhoto[] = [createTestPhoto('top-left')];

      const result = pairPhotos(fronts, backs);

      // Should still create pairs but warn about duplicates
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('duplicate') || w.includes('Duplicate'))).toBe(
        true,
      );
    });

    test('should handle duplicate positions in backs', () => {
      const fronts: CroppedPhoto[] = [createTestPhoto('top-left')];

      const backs: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-left'), // Duplicate
      ];

      const result = pairPhotos(fronts, backs);

      // Should pair with first matching back and warn
      expect(result.pairs).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Logging and statistics', () => {
    test('should handle perfect matching scenario', () => {
      const fronts: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('top-right')];

      const backs: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('top-right')];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
      expect(result.pairs.every((p) => p.back !== undefined)).toBe(true);
    });

    test('should handle partial matching scenario', () => {
      const fronts: CroppedPhoto[] = [
        createTestPhoto('top-left'),
        createTestPhoto('top-right'),
        createTestPhoto('bottom-left'),
      ];

      const backs: CroppedPhoto[] = [createTestPhoto('top-left'), createTestPhoto('bottom-left')];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(3);

      const matched = result.pairs.filter((p) => p.back !== undefined);
      const unmatched = result.pairs.filter((p) => p.back === undefined);

      expect(matched).toHaveLength(2);
      expect(unmatched).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    test('should handle single photo pairing', () => {
      const fronts: CroppedPhoto[] = [createTestPhoto('top-left')];
      const backs: CroppedPhoto[] = [createTestPhoto('top-left')];

      const result = pairPhotos(fronts, backs);

      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].front.position).toBe('top-left');
      expect(result.pairs[0].back?.position).toBe('top-left');
      expect(result.warnings).toHaveLength(0);
    });

    test('should preserve photo data in pairs', () => {
      const frontWithMetadata: CroppedPhoto = {
        image: Buffer.from('front-image'),
        position: 'top-left',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        originalBounds: { x: 0, y: 0, width: 100, height: 100 },
        metadata: {
          extractedText: 'Test text',
          confidence: 0.95,
        },
      };

      const backWithMetadata: CroppedPhoto = {
        image: Buffer.from('back-image'),
        position: 'top-left',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        originalBounds: { x: 0, y: 0, width: 100, height: 100 },
        metadata: {
          extractedText: 'Back text',
          confidence: 0.88,
        },
      };

      const result = pairPhotos([frontWithMetadata], [backWithMetadata]);

      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].front.metadata?.extractedText).toBe('Test text');
      expect(result.pairs[0].back?.metadata?.extractedText).toBe('Back text');
    });

    test('should handle all four grid positions correctly', () => {
      const positions: GridPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

      for (const position of positions) {
        const fronts = [createTestPhoto(position)];
        const backs = [createTestPhoto(position)];

        const result = pairPhotos(fronts, backs);

        expect(result.pairs).toHaveLength(1);
        expect(result.pairs[0].position).toBe(position);
        expect(result.pairs[0].front.position).toBe(position);
        expect(result.pairs[0].back?.position).toBe(position);
      }
    });
  });

  describe('Position tolerance (FR-3.2)', () => {
    // A 1000x1000 scan keeps the arithmetic readable: 10 px is 1% of the scan.
    const SCAN = { width: 1000, height: 1000 };
    const dimensions = { frontDimensions: SCAN, backDimensions: SCAN };

    // A 200x200 photo centred on (cx, cy), labelled with the quadrant the
    // detector would give it (centre versus the scan midpoint).
    function photoAt(cx: number, cy: number, label: string, scan = SCAN): CroppedPhoto {
      const vertical = cy < scan.height / 2 ? 'top' : 'bottom';
      const horizontal = cx < scan.width / 2 ? 'left' : 'right';
      const bounds = { x: cx - 100, y: cy - 100, width: 200, height: 200 };
      return {
        image: Buffer.from(label),
        position: `${vertical}-${horizontal}` as GridPosition,
        bounds,
        originalBounds: bounds,
      };
    }

    test('pairs a back shifted 8% horizontally across the midline', () => {
      const front = photoAt(450, 250, 'front');
      const back = photoAt(530, 250, 'back');
      expect(front.position).toBe('top-left');
      expect(back.position).toBe('top-right');

      const result = pairPhotos([front], [back], dimensions);

      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]?.position).toBe('top-left');
      expect(result.pairs[0]?.back).toBe(back);
      expect(result.warnings).toHaveLength(0);
    });

    test('pairs a back shifted 8% vertically across the midline', () => {
      const front = photoAt(250, 450, 'front');
      const back = photoAt(250, 530, 'back');
      expect(back.position).toBe('bottom-left');

      const result = pairPhotos([front], [back], dimensions);

      expect(result.pairs[0]?.back).toBe(back);
    });

    test('pairs a back shifted exactly 10%', () => {
      const front = photoAt(450, 250, 'front');
      const back = photoAt(550, 250, 'back');

      const result = pairPhotos([front], [back], dimensions);

      expect(result.pairs[0]?.back).toBe(back);
    });

    test('does not pair a back shifted 15% into another quadrant', () => {
      const front = photoAt(450, 250, 'front');
      const back = photoAt(600, 250, 'back');

      const result = pairPhotos([front], [back], dimensions);

      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]?.back).toBeUndefined();
      expect(result.warnings.some((w) => w.includes('Extra') && w.includes('top-right'))).toBe(
        true,
      );
    });

    test('does not pair when only one axis is within tolerance', () => {
      const front = photoAt(450, 450, 'front');
      const back = photoAt(530, 600, 'back');

      const result = pairPhotos([front], [back], dimensions);

      expect(result.pairs[0]?.back).toBeUndefined();
    });

    test('two backs in one quadrant each pair with their nearest front', () => {
      const frontLeft = photoAt(450, 250, 'front-left');
      const frontRight = photoAt(750, 250, 'front-right');
      // The left photo drifted 8% over the midline, so both backs are top-right.
      const backLeft = photoAt(530, 250, 'back-left');
      const backRight = photoAt(760, 250, 'back-right');
      expect(backLeft.position).toBe('top-right');
      expect(backRight.position).toBe('top-right');

      // backRight is listed first: a first-in-quadrant match would hand it to
      // frontRight and drop backLeft.
      const result = pairPhotos([frontLeft, frontRight], [backRight, backLeft], dimensions);

      expect(result.pairs).toHaveLength(2);
      expect(result.pairs[0]?.front).toBe(frontLeft);
      expect(result.pairs[0]?.back).toBe(backLeft);
      expect(result.pairs[1]?.front).toBe(frontRight);
      expect(result.pairs[1]?.back).toBe(backRight);
      expect(result.warnings).toHaveLength(0);
    });

    test('a back within tolerance of two fronts goes to the nearer one', () => {
      const frontA = photoAt(420, 250, 'front-a');
      const frontB = photoAt(580, 250, 'front-b');
      // 9% from frontA, 7% from frontB.
      const back = photoAt(510, 250, 'back');

      const result = pairPhotos([frontA, frontB], [back], dimensions);

      expect(result.pairs[0]?.front).toBe(frontA);
      expect(result.pairs[0]?.back).toBeUndefined();
      expect(result.pairs[1]?.front).toBe(frontB);
      expect(result.pairs[1]?.back).toBe(back);
    });

    test('normalises each side by its own scan dimensions', () => {
      const backScan = { width: 2000, height: 2000 };
      const front = photoAt(450, 250, 'front');
      // 1060/2000 = 0.53 against the front's 0.45: an 8% shift.
      const back = photoAt(1060, 500, 'back', backScan);
      expect(back.position).toBe('top-right');

      const result = pairPhotos([front], [back], {
        frontDimensions: SCAN,
        backDimensions: backScan,
      });

      expect(result.pairs[0]?.back).toBe(back);
    });

    test('honours a custom tolerance', () => {
      const front = photoAt(450, 250, 'front');
      const back = photoAt(530, 250, 'back');

      const result = pairPhotos([front], [back], { ...dimensions, tolerance: 0.05 });

      expect(result.pairs[0]?.back).toBeUndefined();
    });

    test('identical positions pair as before, with no warnings', () => {
      const centres: Array<[number, number]> = [
        [250, 250],
        [750, 250],
        [250, 750],
        [750, 750],
      ];
      const fronts = centres.map(([x, y]) => photoAt(x, y, 'front'));
      const backs = centres.map(([x, y]) => photoAt(x, y, 'back'));

      const result = pairPhotos(fronts, backs, dimensions);

      expect(result.pairs.map((p) => p.position)).toEqual([
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
      ]);
      result.pairs.forEach((pair, i) => {
        expect(pair.back).toBe(backs[i]);
      });
      expect(result.warnings).toHaveLength(0);
    });

    test('a missing back still yields a front-only pair (FR-3.3)', () => {
      const fronts = [photoAt(250, 250, 'front-1'), photoAt(750, 250, 'front-2')];
      const backs = [photoAt(250, 250, 'back-1')];

      const result = pairPhotos(fronts, backs, dimensions);

      expect(result.pairs).toHaveLength(2);
      expect(result.pairs[0]?.back).toBe(backs[0]);
      expect(result.pairs[1]?.back).toBeUndefined();
    });

    test('a back in the same quadrant beyond tolerance still pairs by grid position', () => {
      const front = photoAt(150, 150, 'front');
      const back = photoAt(350, 150, 'back');
      expect(back.position).toBe('top-left');

      const result = pairPhotos([front], [back], dimensions);

      expect(result.pairs[0]?.back).toBe(back);
    });

    test('without scan dimensions a back in another quadrant does not pair', () => {
      const front = photoAt(450, 250, 'front');
      const back = photoAt(530, 250, 'back');

      const result = pairPhotos([front], [back]);

      expect(result.pairs[0]?.back).toBeUndefined();
    });

    test('with dimensions for only one side, falls back to grid position', () => {
      const front = photoAt(450, 250, 'front');
      const back = photoAt(530, 250, 'back');

      const result = pairPhotos([front], [back], { frontDimensions: SCAN });

      expect(result.pairs[0]?.back).toBeUndefined();
    });
  });
});
