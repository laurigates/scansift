# Scan Orchestrator Service

The `ScanOrchestrator` coordinates the complete photo scanning workflow, managing state transitions and integrating all processing modules.

## Overview

The orchestrator implements a state machine that guides users through the scanning process:

```
idle → scanning_fronts → processing → ready_for_backs →
scanning_backs → pairing → saving → complete
```

## Features

- **State Management**: Tracks workflow state with type-safe state machine
- **Event Emission**: Real-time updates for UI integration via EventEmitter
- **Error Handling**: Categorized errors with recovery hints
- **Scanner Integration**: Automatic scanner discovery and communication
- **Photo Processing**: Integrates detection, cropping, enhancement, and pairing
- **Batch Management**: Pairs front/back photos and saves to filesystem

## Usage

### Basic Workflow

```typescript
import { createScanOrchestrator } from './services/scan-orchestrator';

const orchestrator = createScanOrchestrator({
  outputDirectory: './output/scans',
  scanTimeout: 30000,
});

// Check scanner availability
const isReady = await orchestrator.isScannerReady();

// Scan fronts
const frontResult = await orchestrator.startFrontScan({
  resolution: 300,
  colorMode: 'RGB24',
  format: 'image/jpeg',
});

// User flips photos...

// Scan backs
const backResult = await orchestrator.startBackScan();

// Pair and save
const batch = await orchestrator.completeBatch();
console.log(`Saved ${batch.pairsSaved} photo pairs`);
```

### State Tracking

```typescript
// Get current state
const state = orchestrator.getState();

// Listen to state changes
orchestrator.on('state:changed', (state) => {
  console.log('Current state:', state.status);
});
```

### Event Handling

The orchestrator emits the following events:

```typescript
// State changes
orchestrator.on('state:changed', (state: ScanState) => {
  // Update UI based on state
});

// Scan lifecycle
orchestrator.on('scan:started', (scanId: string, type: 'front' | 'back') => {
  console.log(`Scan ${scanId} started`);
});

orchestrator.on('scan:progress', (scanId: string, progress: number) => {
  console.log(`${progress}% complete`);
});

orchestrator.on('scan:complete', (scanId: string, photosDetected: number) => {
  console.log(`Detected ${photosDetected} photos`);
});

orchestrator.on('scan:error', (scanId: string, error: Error) => {
  console.error('Scan failed:', error);
});

// Batch completion
orchestrator.on('batch:complete', (result: BatchResult) => {
  console.log(`Batch saved: ${result.pairsSaved} pairs`);
});
```

## State Machine

### States

| State | Description | Next States |
|-------|-------------|-------------|
| `idle` | Ready to start scanning | `scanning_fronts` |
| `scanning_fronts` | Scanning front side | `processing_fronts`, `error` |
| `processing_fronts` | Detecting and enhancing photos | `ready_for_backs`, `error` |
| `ready_for_backs` | Fronts complete, ready for backs | `scanning_backs`, `saving` |
| `scanning_backs` | Scanning back side | `processing_backs`, `error` |
| `processing_backs` | Processing back photos | `ready_for_backs`, `error` |
| `saving` | Pairing and saving photos | `complete`, `error` |
| `complete` | Batch saved successfully | `idle` |
| `error` | Error occurred | `idle` (after reset) |

### State Properties

Each state includes relevant data:

```typescript
type ScanState =
  | { status: 'idle' }
  | { status: 'scanning_fronts'; scanId: string }
  | { status: 'processing_fronts'; scanId: string; progress: number }
  | { status: 'ready_for_backs'; frontScanId: string; photosDetected: number }
  | { status: 'scanning_backs'; frontScanId: string; backScanId: string }
  | { status: 'processing_backs'; frontScanId: string; backScanId: string; progress: number }
  | { status: 'saving'; batchId: string }
  | { status: 'complete'; batchId: string; photosSaved: number }
  | { status: 'error'; message: string; recoverable: boolean };
```

## API Reference

### Constructor Options

```typescript
interface OrchestratorOptions {
  scanTimeout?: number;      // Scanner discovery timeout (default: 120000ms)
  outputDirectory?: string;  // Output directory (default: './scanned-photos')
}
```

### Methods

#### `isScannerReady(): Promise<boolean>`

Check if a scanner is available on the network.

```typescript
const isReady = await orchestrator.isScannerReady();
if (!isReady) {
  console.error('No scanner found');
}
```

#### `startFrontScan(options?: ScanOptions): Promise<ScanResult>`

Start scanning front sides of photos.

**Parameters:**
- `options` (optional): Scan settings
  - `resolution`: 300 or 600 DPI (default: 300)
  - `colorMode`: 'RGB24' or 'Grayscale8' (default: 'RGB24')
  - `format`: 'image/jpeg' or 'image/png' (default: 'image/jpeg')

**Returns:** `ScanResult` with detected photos

**Throws:**
- `ScannerError`: No scanner found
- `DetectionError`: No photos detected
- `ProcessingError`: Enhancement failed

#### `startBackScan(options?: ScanOptions): Promise<ScanResult>`

Start scanning back sides of photos. Must be called after `startFrontScan()`.

**Returns:** `ScanResult` with detected photos

**Throws:** Same as `startFrontScan()`

#### `completeBatch(): Promise<BatchResult>`

Pair front and back photos, then save to filesystem.

**Returns:** `BatchResult` with save details

**Throws:**
- `StorageError`: Failed to save photos

#### `getState(): ScanState`

Get current workflow state.

#### `reset(): void`

Reset orchestrator to idle state. Call this after an error to start fresh.

## Integration Points

The orchestrator integrates with these modules:

### Scanner Discovery
```typescript
import { discoverScanners } from './scanner/discovery';
```
- Discovers eSCL scanners on network
- Fetches scanner capabilities

### Photo Detection
```typescript
import { detectPhotos } from '../detection/photo-detector';
```
- Detects 1-4 photos using edge detection
- Assigns grid positions (top-left, top-right, etc.)

### Image Enhancement
```typescript
import { enhancePhoto, PRESET_STANDARD } from '../processing/enhancer';
```
- Applies sharpening, normalization, white balance
- Converts to high-quality JPEG

### Photo Pairing
Position-based pairing algorithm:
- Matches front/back by grid position
- Handles missing backs gracefully

## Error Handling

### Error Types

| Error | Recoverable | Meaning |
|-------|-------------|---------|
| `ScannerError` | Yes | Scanner unavailable or connection failed |
| `DetectionError` | Yes | No photos detected (adjust placement) |
| `ProcessingError` | Yes | Enhancement failed (retry) |
| `StorageError` | No | Disk full or permission denied |

### Recovery

```typescript
try {
  await orchestrator.startFrontScan();
} catch (error) {
  const state = orchestrator.getState();

  if (state.status === 'error' && state.recoverable) {
    console.log('Recoverable error - you can retry');
    orchestrator.reset();
  } else {
    console.log('Fatal error - cannot continue');
  }
}
```

## Output Structure

Photos are saved with the following structure:

```
./scanned-photos/
  └── {batchId}/
      ├── photo-001-top-left-front.jpg
      ├── photo-001-top-left-back.jpg
      ├── photo-002-top-right-front.jpg
      ├── photo-002-top-right-back.jpg
      └── ...
```

## Configuration

### Default Settings

```typescript
const DEFAULT_SCAN_OPTIONS = {
  resolution: 300,        // 300 DPI
  colorMode: 'RGB24',     // Full color
  format: 'image/jpeg',   // JPEG format
};

const DEFAULT_OUTPUT_DIR = './scanned-photos';
const DEFAULT_SCAN_TIMEOUT = 120000; // 2 minutes
```

### Enhancement Preset

Uses `PRESET_STANDARD` by default:
- Normalization: ✓
- Sharpening: ✓
- White balance: ✓
- JPEG quality: 95

## Examples

See `scan-orchestrator.example.ts` for:
- Full workflow with front/back scanning
- Fronts-only workflow
- Event-driven UI integration

## Future Enhancements

Planned improvements:
- [ ] Resume interrupted batches
- [ ] Advanced pairing using image similarity
- [ ] Parallel processing for multiple photos
- [ ] Real-time preview during scanning
- [ ] OCR integration for metadata extraction
- [ ] Automatic rotation correction

## Testing

The orchestrator is designed for integration testing:

```typescript
// Mock scanner for testing
const orchestrator = createScanOrchestrator({
  outputDirectory: './tmp/test-output',
  scanTimeout: 5000,
});

// Test state transitions
expect(orchestrator.getState().status).toBe('idle');
await orchestrator.startFrontScan(mockOptions);
expect(orchestrator.getState().status).toBe('ready_for_backs');
```

## License

Part of the PhotoScan project.
