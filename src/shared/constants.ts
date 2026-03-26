/**
 * Shared constants for PhotoScan application.
 */

// Photo detection parameters
export const DETECTION_CONFIG = {
  /** Minimum photo size in pixels at 300 DPI (2" x 2") */
  MIN_PHOTO_SIZE: 1800 * 1800,
  /** Maximum photo size in pixels at 300 DPI (6" x 6") */
  MAX_PHOTO_SIZE: 5400 * 5400,
  /** Canny edge detection low threshold */
  CANNY_LOW: 50,
  /** Canny edge detection high threshold */
  CANNY_HIGH: 150,
  /** Contour approximation epsilon multiplier */
  APPROX_EPSILON: 0.02,
} as const;

// Scan settings
export const SCAN_DEFAULTS = {
  /** Default scan resolution in DPI */
  RESOLUTION: 300 as const,
  /** High quality scan resolution in DPI */
  HIGH_RESOLUTION: 600 as const,
  /** Default color mode */
  COLOR_MODE: 'RGB24' as const,
  /** Default output format */
  FORMAT: 'image/jpeg' as const,
  /** JPEG quality for saved images (1-100) */
  JPEG_QUALITY: 92,
} as const;

// Performance targets
export const PERFORMANCE = {
  /** Maximum scan cycle time in seconds */
  MAX_CYCLE_TIME_SECONDS: 60,
  /** Maximum detection time in seconds */
  MAX_DETECTION_TIME_SECONDS: 15,
  /** Maximum preview generation time in seconds */
  MAX_PREVIEW_TIME_SECONDS: 5,
  /** Scanner discovery timeout in milliseconds */
  DISCOVERY_TIMEOUT_MS: 3000,
} as const;

// File organization
export const FILE_NAMING = {
  /** Date format for filenames */
  DATE_FORMAT: 'yyyy-MM-dd',
  /** Sequence number padding */
  SEQUENCE_PADDING: 3,
} as const;

// Server configuration
export const SERVER = {
  /** Default API port */
  API_PORT: 3000,
  /** Default client dev port */
  CLIENT_PORT: 5173,
} as const;

// Maximum photos per batch
export const MAX_PHOTOS_PER_BATCH = 4;

// Scan timeouts
export const TIMEOUTS = {
  /** Default scan timeout in milliseconds (2 minutes) */
  SCAN_TIMEOUT_MS: 120_000,
  /** Scanner discovery timeout for route endpoints (10 seconds) */
  ROUTE_DISCOVERY_TIMEOUT_MS: 10_000,
  /** Quick scanner ready check timeout (5 seconds) */
  QUICK_DISCOVERY_TIMEOUT_MS: 5_000,
} as const;

// Scan progress stage weights (must sum to 100)
export const PROGRESS_WEIGHTS = {
  /** Initiating stage: 0-10% */
  INITIATING: 0.1,
  /** Scanning stage: 10-80% */
  SCANNING: 0.7,
  /** Scanning stage start offset */
  SCANNING_OFFSET: 10,
  /** Downloading stage: 80-100% */
  DOWNLOADING: 0.2,
  /** Downloading stage start offset */
  DOWNLOADING_OFFSET: 80,
  /** Detection complete progress */
  DETECTION_COMPLETE: 30,
  /** Enhancement complete progress */
  ENHANCEMENT_COMPLETE: 60,
} as const;

// Valid scan resolutions
export const VALID_RESOLUTIONS = [300, 600] as const;
export type ScanResolution = (typeof VALID_RESOLUTIONS)[number];
