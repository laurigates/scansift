/**
 * Custom error types for PhotoScan application.
 * Provides structured error handling with recovery hints.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ScannerError extends AppError {
  constructor(message: string, options?: { recoverable?: boolean }) {
    super(message, 'SCANNER_ERROR', options?.recoverable ?? true);
    this.name = 'ScannerError';
  }
}

export class DetectionError extends AppError {
  constructor(
    message: string,
    public readonly photosDetected: number,
  ) {
    super(message, 'DETECTION_ERROR', true);
    this.name = 'DetectionError';
  }
}

export class ProcessingError extends AppError {
  constructor(message: string) {
    super(message, 'PROCESSING_ERROR', true);
    this.name = 'ProcessingError';
  }
}

export class StorageError extends AppError {
  constructor(message: string) {
    super(message, 'STORAGE_ERROR', false);
    this.name = 'StorageError';
  }
}

/**
 * User-friendly error messages.
 * Maps error codes to actionable messages.
 */
export const USER_ERROR_MESSAGES: Record<string, string> = {
  SCANNER_ERROR:
    'Scanner is not available. Check that it is powered on and connected to your network.',
  DETECTION_ERROR:
    'Could not detect photos in the scan. Try adjusting photo placement or scanning again.',
  PROCESSING_ERROR:
    'An error occurred while processing the photo. The original scan has been saved.',
  STORAGE_ERROR: 'Not enough disk space to save photos. Free up space and try again.',
};

/**
 * Get user-friendly error message for an error.
 */
export const getUserMessage = (error: Error): string => {
  if (error instanceof AppError) {
    return USER_ERROR_MESSAGES[error.code] ?? error.message;
  }
  return 'An unexpected error occurred. Please try again.';
};
