/**
 * Tests for custom error types and user-friendly error messages.
 */

import { describe, expect, test } from 'bun:test';
import {
  AppError,
  DetectionError,
  getUserMessage,
  ProcessingError,
  ScannerError,
  StorageError,
  USER_ERROR_MESSAGES,
} from '../src/server/errors';

describe('AppError', () => {
  test('should set message, code, and recoverable properties', () => {
    const error = new AppError('something broke', 'CUSTOM_CODE', true);

    expect(error.message).toBe('something broke');
    expect(error.code).toBe('CUSTOM_CODE');
    expect(error.recoverable).toBe(true);
    expect(error.name).toBe('AppError');
  });

  test('should default recoverable to false', () => {
    const error = new AppError('fail', 'SOME_CODE');

    expect(error.recoverable).toBe(false);
  });

  test('should be an instance of Error', () => {
    const error = new AppError('test', 'CODE');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('ScannerError', () => {
  test('should set correct defaults', () => {
    const error = new ScannerError('scanner offline');

    expect(error.message).toBe('scanner offline');
    expect(error.code).toBe('SCANNER_ERROR');
    expect(error.recoverable).toBe(true);
    expect(error.name).toBe('ScannerError');
  });

  test('should allow overriding recoverable to false', () => {
    const error = new ScannerError('hardware failure', { recoverable: false });

    expect(error.recoverable).toBe(false);
  });

  test('should allow explicitly setting recoverable to true', () => {
    const error = new ScannerError('timeout', { recoverable: true });

    expect(error.recoverable).toBe(true);
  });

  test('should be an instance of AppError and Error', () => {
    const error = new ScannerError('test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ScannerError);
  });
});

describe('DetectionError', () => {
  test('should set correct defaults and photosDetected', () => {
    const error = new DetectionError('no photos found', 0);

    expect(error.message).toBe('no photos found');
    expect(error.code).toBe('DETECTION_ERROR');
    expect(error.recoverable).toBe(true);
    expect(error.photosDetected).toBe(0);
    expect(error.name).toBe('DetectionError');
  });

  test('should store photosDetected count', () => {
    const error = new DetectionError('partial detection', 3);

    expect(error.photosDetected).toBe(3);
  });

  test('should be an instance of AppError and Error', () => {
    const error = new DetectionError('test', 1);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(DetectionError);
  });
});

describe('ProcessingError', () => {
  test('should set correct defaults', () => {
    const error = new ProcessingError('crop failed');

    expect(error.message).toBe('crop failed');
    expect(error.code).toBe('PROCESSING_ERROR');
    expect(error.recoverable).toBe(true);
    expect(error.name).toBe('ProcessingError');
  });

  test('should be an instance of AppError and Error', () => {
    const error = new ProcessingError('test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ProcessingError);
  });
});

describe('StorageError', () => {
  test('should set correct defaults', () => {
    const error = new StorageError('disk full');

    expect(error.message).toBe('disk full');
    expect(error.code).toBe('STORAGE_ERROR');
    expect(error.recoverable).toBe(false);
    expect(error.name).toBe('StorageError');
  });

  test('should be an instance of AppError and Error', () => {
    const error = new StorageError('test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(StorageError);
  });
});

describe('getUserMessage', () => {
  test('should return correct message for ScannerError', () => {
    const error = new ScannerError('internal detail');
    const message = getUserMessage(error);

    expect(message).toBe(USER_ERROR_MESSAGES.SCANNER_ERROR);
  });

  test('should return correct message for DetectionError', () => {
    const error = new DetectionError('internal detail', 0);
    const message = getUserMessage(error);

    expect(message).toBe(USER_ERROR_MESSAGES.DETECTION_ERROR);
  });

  test('should return correct message for ProcessingError', () => {
    const error = new ProcessingError('internal detail');
    const message = getUserMessage(error);

    expect(message).toBe(USER_ERROR_MESSAGES.PROCESSING_ERROR);
  });

  test('should return correct message for StorageError', () => {
    const error = new StorageError('internal detail');
    const message = getUserMessage(error);

    expect(message).toBe(USER_ERROR_MESSAGES.STORAGE_ERROR);
  });

  test('should return generic message for non-AppError', () => {
    const error = new Error('something went wrong');
    const message = getUserMessage(error);

    expect(message).toBe('An unexpected error occurred. Please try again.');
  });

  test('should return generic message for TypeError', () => {
    const error = new TypeError('null reference');
    const message = getUserMessage(error);

    expect(message).toBe('An unexpected error occurred. Please try again.');
  });

  test('should fall back to error.message for unknown AppError code', () => {
    const error = new AppError('custom fallback message', 'UNKNOWN_CODE', false);
    const message = getUserMessage(error);

    expect(message).toBe('custom fallback message');
  });
});
