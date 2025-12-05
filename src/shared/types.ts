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
export type GridPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

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
