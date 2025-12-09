/**
 * Shared types for PhotoScan application.
 * Used by both server and client.
 */

// Scan workflow state machine
export type ScanState =
  | { status: 'idle' }
  | { status: 'scanning_fronts'; scanId: string }
  | { status: 'processing_fronts'; scanId: string; progress: number }
  | {
      status: 'ready_for_backs';
      frontScanId: string;
      photosDetected: number;
    }
  | { status: 'scanning_backs'; frontScanId: string; backScanId: string }
  | {
      status: 'processing_backs';
      frontScanId: string;
      backScanId: string;
      progress: number;
    }
  | { status: 'saving'; batchId: string }
  | { status: 'complete'; batchId: string; photosSaved: number }
  | { status: 'error'; message: string; recoverable: boolean };

// Grid positions for photo placement
export type GridPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Scanner information
export interface Scanner {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  model?: string;
}

export interface ScannerStatus {
  available: boolean;
  model?: string;
  ip?: string;
}

// Scan options
export interface ScanOptions {
  resolution: 300 | 600;
  colorMode: 'RGB24' | 'Grayscale8';
  format: 'image/jpeg' | 'image/png';
}

// Detected photo from a scan
export interface DetectedPhoto {
  image: Buffer;
  position: GridPosition;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

// Photo metadata extracted from OCR
export interface PhotoMetadata {
  extractedText?: string;
  extractedDate?: Date;
  confidence: number;
  words?: Array<{ text: string; confidence: number }>;
}

// Saved photo record
export interface Photo {
  id: number;
  frontFilePath: string;
  backFilePath?: string;
  originalFrontPath: string;
  originalBackPath?: string;
  scanDate: string;
  photoDate?: string;
  extractedText?: string;
  gridPosition?: GridPosition;
  confidenceScore?: number;
}

// Session statistics
export interface SessionStats {
  totalPhotos: number;
  sessionPhotos: number;
  sessionStartTime: string;
}

// WebSocket events
export type ServerEvent =
  | { type: 'scan:progress'; scanId: string; progress: number }
  | { type: 'scan:complete'; scanId: string; photos: number }
  | { type: 'scan:error'; scanId: string; message: string }
  | { type: 'scanner:status'; available: boolean };

export type ClientEvent =
  | { type: 'scan:start'; scanType: 'front' | 'back' }
  | { type: 'scan:cancel'; scanId: string };

// Photo detection result
export interface DetectionResult {
  photos: DetectedPhoto[];
  processingTime: number; // milliseconds
  warnings?: string[];
}

// Image enhancement options
export interface EnhancementOptions {
  sharpen?: boolean | { sigma?: number; m1?: number; m2?: number };
  normalize?: boolean;
  gamma?: number;
  rotation?: number; // Degrees to rotate (positive = clockwise)
  whiteBalance?: boolean;
}

// Applied enhancement details for tracking
export interface AppliedEnhancement {
  type: 'sharpen' | 'normalize' | 'gamma' | 'rotation' | 'whiteBalance' | 'format';
  description: string;
  parameters?: Record<string, number | boolean | string>;
}

// Result of image enhancement processing
export interface EnhancementResult {
  buffer: Buffer;
  appliedEnhancements: AppliedEnhancement[];
  processingTime: number; // milliseconds
  inputFormat?: string;
  outputFormat: string;
  dimensions: {
    width: number;
    height: number;
  };
}

// Scan result from scanning operation
export interface ScanResult {
  scanId: string;
  photosDetected: number;
  rawImagePath: string;
  timestamp: Date;
  detectedPhotos: DetectedPhoto[];
}

// Batch result from completing a batch
export interface BatchResult {
  batchId: string;
  pairsSaved: number;
  totalPhotos: number;
  outputDirectory: string;
  timestamp: Date;
}

// Cropped photo ready for pairing (after detection and enhancement)
export interface CroppedPhoto {
  image: Buffer;
  position: GridPosition;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  originalBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  enhanced?: boolean;
  metadata?: PhotoMetadata;
}

// Paired photo (front with optional back)
export interface PhotoPair {
  front: CroppedPhoto;
  back?: CroppedPhoto;
  position: GridPosition;
}

// Result of pairing operation
export interface PairingResult {
  pairs: PhotoPair[];
  warnings: string[];
}
