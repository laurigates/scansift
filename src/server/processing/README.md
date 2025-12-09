# Image Processing Module

This directory contains image processing utilities for the PhotoScan application.

## Modules

### `enhancer.ts`

High-performance image enhancement pipeline for scanned photos using Sharp.

**Key Features:**
- Auto white balance correction
- Contrast/brightness normalization
- Sharpening filters for slightly blurry scans
- Gamma correction for faded photos
- Rotation/deskew support
- High-quality JPEG output (95% quality)

**Presets:**
- `PRESET_LIGHT` - Minimal processing (sharpen only)
- `PRESET_STANDARD` - Standard workflow (normalize + sharpen + white balance)
- `PRESET_VINTAGE` - Aggressive restoration for old faded photos (includes gamma correction)

**Performance:**
- Efficient pipeline chaining minimizes memory overhead
- Processing time tracked for monitoring
- Optimized for typical scan sizes (300-600 DPI)

**Example:**
```typescript
import { enhancePhoto, PRESET_STANDARD } from './processing/enhancer';

const result = await enhancePhoto(imageBuffer, PRESET_STANDARD);
console.log(`Enhanced in ${result.processingTime}ms`);
console.log(`Applied ${result.appliedEnhancements.length} enhancements`);
```

## Testing

All modules have comprehensive unit tests in `tests/processing/`.

Run tests:
```bash
bun test tests/processing/
```

## Type Definitions

Enhancement types are defined in `src/shared/types.ts`:
- `EnhancementOptions` - Configuration options for enhancement pipeline
- `EnhancementResult` - Result object with enhanced buffer and metadata
- `AppliedEnhancement` - Details about each enhancement applied
