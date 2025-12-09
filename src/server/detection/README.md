# Photo Detection Module

This module implements photo detection using OpenCV.js for identifying 1-4 photos placed on a flatbed scanner.

## Algorithm Overview

The detection algorithm uses computer vision techniques to identify rectangular photo regions:

1. **Grayscale Conversion**: Convert the scanned image to grayscale for simpler processing
2. **Gaussian Blur**: Apply blur to reduce noise and improve edge detection
3. **Canny Edge Detection**: Detect edges in the image using the Canny algorithm
4. **Contour Detection**: Find all contours from the edge map
5. **Filtering**: Filter contours by:
   - Minimum area (2" × 2" at the scan DPI)
   - Shape approximation to quadrilaterals (4-8 vertices)
   - Reasonable aspect ratio (0.5 to 2.0)
6. **Position Assignment**: Assign grid positions based on spatial location (top-left, top-right, bottom-left, bottom-right)
7. **Sorting**: Sort detected photos by position for consistent ordering

## Files

- **`photo-detector.ts`**: Main detection algorithm implementation
- **`opencv-loader.ts`**: OpenCV.js WASM module initialization helper
- **`README.md`**: This file

## Usage

```typescript
import { detectPhotos } from '@/server/detection/photo-detector';
import type { DetectionResult } from '@/shared/types';

// Load image buffer (from scanner or file)
const imageBuffer: Buffer = /* ... */;
const dpi = 300; // Scan resolution

try {
  const result: DetectionResult = await detectPhotos(imageBuffer, dpi);

  console.log(`Detected ${result.photos.length} photos`);
  console.log(`Processing time: ${result.processingTime}ms`);

  result.photos.forEach((photo) => {
    console.log(`  Position: ${photo.position}`);
    console.log(`  Bounds: x=${photo.bounds.x}, y=${photo.bounds.y}, w=${photo.bounds.width}, h=${photo.bounds.height}`);
    console.log(`  Confidence: ${photo.confidence}`);
  });

  if (result.warnings) {
    result.warnings.forEach((warning) => console.warn(warning));
  }
} catch (error) {
  console.error('Detection failed:', error);
}
```

## Configuration

### Supported DPI Values

- 100, 150, 200, 300, 600, 1200 DPI

### Minimum Photo Size

- 2" × 2" at the scan DPI
  - At 300 DPI: 600 × 600 pixels
  - At 600 DPI: 1200 × 1200 pixels

### Detection Parameters

- **Gaussian Blur**: 5×5 kernel
- **Canny Edge Detection**: Low threshold 50, high threshold 150
- **Contour Approximation**: 2% of arc length (Douglas-Peucker algorithm)
- **Acceptable Vertices**: 4-8 vertices (allows for imperfect scans)
- **Aspect Ratio Range**: 0.5 to 2.0 (width/height)

## Known Issues

### OpenCV.js Initialization in Bun Test Environment

There is a known compatibility issue between OpenCV.js WASM initialization and Bun's test runner. The WASM module initializes correctly, but Promise resolution from the `onRuntimeInitialized` callback doesn't properly trigger `.then()` handlers in the test context.

**Status**: The code works correctly in production/server context but unit tests may timeout.

**Workaround Options**:
1. Skip OpenCV-dependent tests in CI (mark as `.skip` or use test filters)
2. Test with Node.js instead of Bun for OpenCV-related tests
3. Create integration tests that run in a real server context
4. Mock the OpenCV functionality for unit tests

**Tracking**: See Bun issues related to WASM Promise resolution

## Testing

### Unit Tests

Located in `tests/detection/photo-detector.test.ts`:

- Single photo detection
- Multiple photo detection (2-4 photos)
- Grid position assignment
- DPI handling
- Edge cases (empty scanner, invalid images, too-small regions)

### Running Tests

```bash
# Run all detection tests
bun test tests/detection/

# Run with coverage
bun test --coverage tests/detection/

# Skip OpenCV tests (if experiencing initialization issues)
bun test tests/detection/ --exclude "*opencv*"
```

## Performance

Typical processing times (on M1 MacBook Pro):
- 300 DPI image (3000×3000px): ~100-200ms
- 600 DPI image (6000×6000px): ~400-800ms

## Future Improvements

1. **Machine Learning**: Use a trained model for more accurate photo detection
2. **Perspective Correction**: Detect and correct skewed photos
3. **Multi-threading**: Process detection in parallel for multiple images
4. **Adaptive Thresholding**: Dynamically adjust detection parameters based on image characteristics
5. **Photo Separation**: Detect multiple photos that are touching or overlapping
