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
});
