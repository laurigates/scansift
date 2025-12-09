/**
 * Scanner services module exports.
 *
 * Provides scanner discovery and eSCL protocol communication.
 */

export {
  type DiscoveredScanner,
  discoverScanners,
  getScannerCapabilities,
  getScannerStatus,
  type ScannerCapabilities,
} from './discovery';

export {
  buildScanSettings,
  cancelScanJob,
  createScanJob,
  downloadDocument,
  getScannerBaseUrl,
  performScan,
  type ScanJobResult,
  type ScanProgressCallback,
  VALID_RESOLUTIONS,
  type ValidResolution,
  waitForScanReady,
} from './escl-client';
