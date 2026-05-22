# Photo Detection Module

This module implements photo detection using Sharp-based Sobel edge detection for identifying 1-4 photos placed on a flatbed scanner.

## Algorithm Overview

The detection algorithm uses Sharp's image-processing primitives to identify rectangular photo regions:

1. **Grayscale Conversion**: Convert the scanned image to grayscale for simpler processing
2. **Sobel X Convolution**: Apply a 3×3 horizontal Sobel kernel via `sharp.convolve()` to surface vertical edges
3. **Sobel Y Convolution**: Apply a 3×3 vertical Sobel kernel via `sharp.convolve()` to surface horizontal edges
4. **Magnitude Combination**: Combine the two edge maps into a single magnitude image (sqrt of squared components, centered around 128)
5. **Projection Profile Analysis**: Sum edge intensities along rows and columns to find horizontal and vertical edge lines bounding each photo
6. **Region Construction**: Build candidate photo regions from intersecting edge lines, filtered by minimum area (2" × 2" at the scan DPI)
7. **Position Assignment**: Assign grid positions based on spatial location (top-left, top-right, bottom-left, bottom-right)
8. **Sorting**: Sort detected photos by position for consistent ordering

## Files

- **`photo-detector.ts`**: Main detection algorithm implementation
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

- **Sobel Kernels**: 3×3 X kernel `[-1,0,1,-2,0,2,-1,0,1]`, 3×3 Y kernel `[-1,-2,-1,0,0,0,1,2,1]`
- **Edge Magnitude**: `sqrt(gx² + gy²)` clamped to 0-255, with the convolution output centered around 128
- **Minimum Photo Area**: 2" × 2" at the scan DPI (e.g. 600×600 px at 300 DPI)

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
