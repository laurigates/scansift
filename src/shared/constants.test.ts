import { describe, it, expect } from 'bun:test';
import {
  DETECTION_CONFIG,
  SCAN_DEFAULTS,
  PERFORMANCE,
  MAX_PHOTOS_PER_BATCH,
} from './constants';

describe('constants', () => {
  describe('DETECTION_CONFIG', () => {
    it('has valid photo size constraints', () => {
      expect(DETECTION_CONFIG.MIN_PHOTO_SIZE).toBeLessThan(
        DETECTION_CONFIG.MAX_PHOTO_SIZE
      );
    });

    it('has valid Canny thresholds', () => {
      expect(DETECTION_CONFIG.CANNY_LOW).toBeLessThan(
        DETECTION_CONFIG.CANNY_HIGH
      );
    });
  });

  describe('SCAN_DEFAULTS', () => {
    it('has valid resolution values', () => {
      expect(SCAN_DEFAULTS.RESOLUTION).toBe(300);
      expect(SCAN_DEFAULTS.HIGH_RESOLUTION).toBe(600);
    });

    it('has valid JPEG quality', () => {
      expect(SCAN_DEFAULTS.JPEG_QUALITY).toBeGreaterThanOrEqual(1);
      expect(SCAN_DEFAULTS.JPEG_QUALITY).toBeLessThanOrEqual(100);
    });
  });

  describe('PERFORMANCE', () => {
    it('has reasonable time limits', () => {
      expect(PERFORMANCE.MAX_CYCLE_TIME_SECONDS).toBeGreaterThan(0);
      expect(PERFORMANCE.MAX_DETECTION_TIME_SECONDS).toBeGreaterThan(0);
    });
  });

  describe('MAX_PHOTOS_PER_BATCH', () => {
    it('is set to 4 for batch scanning', () => {
      expect(MAX_PHOTOS_PER_BATCH).toBe(4);
    });
  });
});
