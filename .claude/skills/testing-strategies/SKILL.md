# PhotoScan Testing Strategies

Testing patterns, TDD workflow, and test organization for the PhotoScan application. Use when writing tests, setting up test infrastructure, or debugging test failures.

## TDD Workflow

Follow strict **RED → GREEN → REFACTOR**:

1. **RED**: Write a failing test that defines desired behavior
2. **GREEN**: Implement minimal code to make the test pass
3. **REFACTOR**: Improve code quality while keeping tests green

```typescript
// Example TDD cycle for photo detection

// 1. RED - Write failing test first
describe('PhotoDetector', () => {
  it('detects 4 photos in a batch scan', async () => {
    const detector = createPhotoDetector(mockOpenCV, defaultConfig);
    const scanImage = await loadTestImage('4-photos-batch.jpg');

    const result = await detector.detect(scanImage);

    expect(result.photos).toHaveLength(4);
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});

// 2. GREEN - Implement minimal solution
export const createPhotoDetector = (opencv, config) => ({
  detect: async (image) => {
    const contours = await opencv.findContours(image);
    const photos = filterBySize(contours, config.minSize, config.maxSize);
    return {
      photos: photos.map(extractPhoto),
      confidence: calculateConfidence(photos),
    };
  },
});

// 3. REFACTOR - Improve without changing behavior
```

## Test Framework Configuration

### Vitest Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['tests/**', '**/*.d.ts', 'src/client/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['./tests/setup.ts'],
  },
});
```

### Test Setup File

```typescript
// tests/setup.ts
import { beforeAll, afterAll, vi } from 'vitest';

// Mock external dependencies
vi.mock('better-sqlite3');
vi.mock('opencv4nodejs');

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global cleanup
});
```

## Test Categories

### Unit Tests (Target: 80%+ coverage)

Test individual functions and modules in isolation:

```typescript
// src/server/services/detection/photo-detector.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPhotoDetector } from './photo-detector';

describe('createPhotoDetector', () => {
  const mockOpenCV = {
    findContours: vi.fn(),
    drawContours: vi.fn(),
  };

  it('filters contours by minimum size', async () => {
    mockOpenCV.findContours.mockResolvedValue([
      { area: 1000 }, // Too small
      { area: 5000000 }, // Valid photo
    ]);

    const detector = createPhotoDetector(mockOpenCV, {
      minSize: 3240000, // 1800x1800 at 300 DPI
    });

    const result = await detector.detect(Buffer.from([]));

    expect(result.photos).toHaveLength(1);
  });
});
```

### Integration Tests

Test service interactions:

```typescript
// tests/integration/scan-workflow.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp } from '../helpers/app';

describe('Scan Workflow Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('completes full scan cycle', async () => {
    // Start front scan
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/scan/start',
      payload: { type: 'front', resolution: 300 },
    });
    expect(startRes.statusCode).toBe(200);
    const { scanId } = startRes.json();

    // Wait for processing
    await waitForScanComplete(app, scanId);

    // Verify photos detected
    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/scan/${scanId}/status`,
    });
    expect(statusRes.json().photosDetected).toBeGreaterThan(0);
  });
});
```

### E2E Tests (Playwright)

Test complete user workflows:

```typescript
// tests/e2e/scanning.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Photo Scanning Workflow', () => {
  test('user can scan batch of photos', async ({ page }) => {
    await page.goto('/');

    // Verify scanner connected
    await expect(page.getByTestId('scanner-status')).toHaveText('Connected');

    // Start scan
    await page.getByRole('button', { name: 'Scan Fronts' }).click();

    // Wait for processing
    await expect(page.getByTestId('scan-progress')).toBeVisible();
    await expect(page.getByText('Scanning...')).toBeVisible();

    // Verify completion
    await expect(page.getByText(/\d+ photos detected/)).toBeVisible({
      timeout: 30000,
    });

    // Verify preview thumbnails
    await expect(page.getByTestId('preview-grid').locator('img')).toHaveCount(
      4
    );
  });
});
```

## Test Commands

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage report
pnpm test:coverage

# Run integration tests only
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run E2E tests with UI
pnpm test:e2e:ui
```

## Mocking Patterns

### Scanner Mocking

```typescript
// tests/mocks/scanner.ts
import { vi } from 'vitest';
import type { ScannerService } from '@/server/services/scanner';

export const createMockScanner = (): ScannerService => ({
  discover: vi.fn().mockResolvedValue([
    {
      name: 'Test Scanner',
      host: 'localhost',
      port: 8080,
      addresses: ['127.0.0.1'],
    },
  ]),
  scan: vi.fn().mockResolvedValue({
    id: 'test-scan-id',
    image: Buffer.from([]),
    timestamp: new Date(),
  }),
  getStatus: vi.fn().mockResolvedValue({
    available: true,
    model: 'Test Scanner',
  }),
});
```

### Database Mocking

```typescript
// tests/mocks/database.ts
import { vi } from 'vitest';

export const createMockDB = () => ({
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
});
```

### Image Test Fixtures

```typescript
// tests/fixtures/images.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FIXTURES_DIR = join(__dirname, 'images');

export const loadTestImage = async (name: string): Promise<Buffer> => {
  return readFile(join(FIXTURES_DIR, name));
};

// Pre-defined test images:
// - 4-photos-batch.jpg: Standard 4-photo batch scan
// - single-photo.jpg: Single photo for edge case testing
// - rotated-photos.jpg: Photos at various angles
// - faded-vintage.jpg: Low-contrast vintage photo
// - handwritten-back.jpg: Photo back with handwriting
```

## Test Organization

```
tests/
├── setup.ts              # Global test setup
├── helpers/
│   ├── app.ts           # Test app factory
│   ├── assertions.ts    # Custom assertions
│   └── wait.ts          # Async test utilities
├── mocks/
│   ├── scanner.ts       # Scanner mocks
│   ├── database.ts      # DB mocks
│   └── opencv.ts        # OpenCV mocks
├── fixtures/
│   ├── images/          # Test images
│   │   ├── 4-photos-batch.jpg
│   │   └── ...
│   └── data/            # Test data files
├── unit/
│   └── ...              # Unit tests (if not co-located)
├── integration/
│   ├── scan-workflow.test.ts
│   └── processing-pipeline.test.ts
└── e2e/
    ├── scanning.spec.ts
    └── settings.spec.ts
```

## Coverage Requirements

| Module | Minimum Coverage |
|--------|-----------------|
| Scanner Service | 80% |
| Photo Detection | 90% |
| Image Processing | 80% |
| OCR Extraction | 70% |
| API Endpoints | 80% |
| Database Operations | 80% |

## Testing Best Practices

### Test Naming

Use descriptive names that explain the scenario:

```typescript
// Good
it('returns empty array when no photos detected in scan', () => {});
it('pairs fronts with backs based on grid position', () => {});
it('falls back to SANE when eSCL connection fails', () => {});

// Avoid
it('works correctly', () => {});
it('handles edge case', () => {});
```

### Arrange-Act-Assert

Structure tests clearly:

```typescript
it('extracts date from OCR text', async () => {
  // Arrange
  const ocrService = createOCRService(tesseract);
  const backImage = await loadTestImage('dated-back.jpg');

  // Act
  const result = await ocrService.extractMetadata(backImage);

  // Assert
  expect(result.date).toEqual(new Date('1985-06-15'));
  expect(result.confidence).toBeGreaterThan(0.7);
});
```

### Test Isolation

Each test should be independent:

```typescript
// Good: Each test sets up its own state
describe('PhotoRepository', () => {
  let db: TestDB;

  beforeEach(async () => {
    db = await createTestDB();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates photo record', async () => {
    const repo = createPhotoRepository(db);
    // Test with fresh database
  });
});
```
