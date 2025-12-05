# PhotoScan Quality Standards

Code quality, performance baselines, security requirements, and review checklists for the PhotoScan application. Use when reviewing code, preparing PRs, or validating implementations.

## Code Review Checklist

### Before Submitting PR

- [ ] **Tests pass**: All unit, integration, and E2E tests green
- [ ] **Coverage maintained**: No decrease in test coverage (80%+ target)
- [ ] **TypeScript strict**: No `any` types, all errors resolved
- [ ] **Linting clean**: ESLint and Prettier pass
- [ ] **No console.log**: Remove debug statements
- [ ] **Error handling**: All user-facing errors have clear messages
- [ ] **Documentation**: JSDoc for public APIs, inline comments for complex logic

### Code Quality Checks

- [ ] **Single responsibility**: Functions do one thing well
- [ ] **Pure functions**: Side effects isolated and explicit
- [ ] **No magic numbers**: Constants named and documented
- [ ] **Defensive at boundaries**: Validate external input (API, user, scanner)
- [ ] **Fail fast internally**: Trust internal code, no redundant validation
- [ ] **Immutable data**: Avoid mutations, use spread/map/filter

### Security Checks

- [ ] **Input validation**: All API inputs validated with Zod
- [ ] **No injection risks**: File paths sanitized, no shell commands with user input
- [ ] **Error messages**: Don't leak internal details to users
- [ ] **Local-only**: No network calls except scanner and local server

### Performance Checks

- [ ] **No blocking operations**: Async for I/O, streaming for large files
- [ ] **Memory efficient**: Buffer reuse, streaming where possible
- [ ] **Appropriate logging**: Not in hot paths, structured format

## Performance Baselines

### Response Time Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| API response (simple) | <100ms | <500ms |
| Scan initiation | <2s | <5s |
| Photo detection (4 photos) | <15s | <30s |
| Image processing (single) | <3s | <10s |
| OCR extraction | <5s | <15s |
| Preview generation | <5s | <10s |
| Full scan cycle | <60s | <90s |

### Resource Usage Targets

| Resource | Normal | Maximum |
|----------|--------|---------|
| Memory (idle) | <200MB | <500MB |
| Memory (processing) | <1GB | <2GB |
| CPU (idle) | <5% | <10% |
| CPU (processing) | <50% avg | <90% peak |
| Disk per photo | ~5MB | 10MB |

### Throughput Targets

- **Photos per hour**: 100+ (4 photos every 2.5 minutes)
- **Sessions per day**: Support 8+ hour sessions without restart
- **Collection size**: Handle 10,000+ photos in database

## Security Requirements

### OWASP Compliance

**A01 - Access Control**:
- Local-only web server (no public exposure)
- No authentication required for MVP (single-user)
- File permissions: User read/write only

**A02 - Cryptographic Failures**:
- N/A for MVP (no sensitive data stored encrypted)
- Future: Consider encryption for metadata with PII

**A03 - Injection**:
```typescript
// Good: Parameterized queries with Drizzle
const photos = await db
  .select()
  .from(photosTable)
  .where(eq(photosTable.date, userInput));

// Bad: String interpolation
const photos = db.query(`SELECT * FROM photos WHERE date = '${userInput}'`);
```

**A04 - Insecure Design**:
- Validate all file paths are within allowed directories
- Sanitize filenames before saving

```typescript
// Good: Validate paths
const safePath = (userPath: string): string => {
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(basePath)) {
    throw new SecurityError('Path traversal attempt');
  }
  return resolved;
};
```

**A05 - Security Misconfiguration**:
- No default credentials
- Minimal dependencies
- Environment-based configuration

**A06 - Vulnerable Components**:
- Regular dependency updates
- `pnpm audit` in CI pipeline
- Dependabot/Renovate for automated updates

**A07 - Authentication Failures**:
- N/A for MVP (local single-user)

**A08 - Data Integrity Failures**:
- Verify scanner responses before processing
- Validate image data before saving

**A09 - Security Logging**:
- Log all errors with context
- Log scanner connection attempts
- No PII in logs

**A10 - SSRF**:
- Scanner URLs validated against discovered services
- No arbitrary URL fetching

### Input Validation

```typescript
// All API inputs validated with Zod
import { z } from 'zod';

const scanRequestSchema = z.object({
  type: z.enum(['front', 'back']),
  resolution: z.union([z.literal(300), z.literal(600)]),
});

// Route handler
app.post('/api/scan/start', async (req, reply) => {
  const result = scanRequestSchema.safeParse(req.body);
  if (!result.success) {
    return reply.code(400).send({
      error: 'Invalid request',
      details: result.error.flatten(),
    });
  }
  // Use result.data (typed correctly)
});
```

### File Path Security

```typescript
// Prevent directory traversal
const sanitizeFilename = (name: string): string => {
  // Remove path separators and special characters
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .substring(0, 255);
};

// Validate within allowed directory
const isWithinDirectory = (filePath: string, directory: string): boolean => {
  const resolved = path.resolve(directory, filePath);
  return resolved.startsWith(path.resolve(directory));
};
```

## Code Style Standards

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### ESLint Rules

```javascript
// eslint.config.js
export default [
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `photo-detector.ts` |
| Functions | camelCase | `detectPhotos()` |
| Types/Interfaces | PascalCase | `ScanResult` |
| Constants | SCREAMING_SNAKE | `MAX_PHOTOS_PER_BATCH` |
| React Components | PascalCase | `ScanButton.tsx` |
| CSS Classes | kebab-case | `scan-button-primary` |

### Documentation Standards

```typescript
/**
 * Detects individual photos within a batch scan image.
 *
 * Uses OpenCV contour detection to identify photo boundaries,
 * then extracts and deskews each photo.
 *
 * @param image - Raw scan image buffer (JPEG or PNG)
 * @param config - Detection configuration including min/max size
 * @returns Array of detected photos with position and confidence
 * @throws DetectionError if image cannot be processed
 *
 * @example
 * const detector = createPhotoDetector(config);
 * const photos = await detector.detect(scanBuffer);
 * console.log(`Detected ${photos.length} photos`);
 */
const detect = async (image: Buffer, config: DetectionConfig): Promise<DetectedPhoto[]> => {
  // Implementation
};
```

## Accessibility Standards

### WCAG 2.1 Level AA Compliance

**Touch Targets**:
```css
/* Minimum 44x44pt for touch targets */
.scan-button {
  min-width: 44px;
  min-height: 44px;
  padding: 1rem 2rem;
}
```

**Color Contrast**:
- Text contrast ratio: 4.5:1 minimum
- Large text: 3:1 minimum
- Interactive elements: 3:1 minimum

**Screen Reader Support**:
```tsx
// Use semantic HTML and ARIA
<button
  aria-label="Start scanning photos"
  aria-busy={isScanning}
  aria-live="polite"
>
  {isScanning ? 'Scanning...' : 'Scan Fronts'}
</button>

// Progress announcements
<div role="status" aria-live="polite">
  {progress > 0 && `Processing: ${progress}% complete`}
</div>
```

**Keyboard Navigation**:
- All interactive elements focusable
- Visible focus indicators
- Logical tab order

## Error Message Standards

### User-Facing Errors

```typescript
// Good: Clear, actionable messages
const userErrors = {
  SCANNER_OFFLINE: 'Scanner is not available. Check that it is powered on and connected to your network.',
  DETECTION_FAILED: 'Could not detect photos in the scan. Try adjusting photo placement or scanning again.',
  STORAGE_FULL: 'Not enough disk space to save photos. Free up space and try again.',
  PROCESSING_FAILED: 'An error occurred while processing the photo. The original scan has been saved.',
};

// Bad: Technical jargon
// "ECONNREFUSED 192.168.1.100:80"
// "OpenCV error: findContours failed"
// "SQLITE_CONSTRAINT: UNIQUE constraint failed"
```

### Logging Errors

```typescript
import pino from 'pino';

const logger = pino({ level: 'info' });

// Include context for debugging
logger.error({
  err: error,
  scanId,
  operation: 'photoDetection',
  imageSize: image.length,
}, 'Photo detection failed');

// Don't log sensitive data
// Bad: logger.info({ filePath: '/Users/john/photos/...' })
// Good: logger.info({ fileCount: photos.length })
```

## Dependency Management

### Dependency Criteria

Before adding a dependency:
1. **Actively maintained**: Commits within last 3 months
2. **TypeScript support**: Full type definitions
3. **Security**: No known vulnerabilities
4. **Size**: Reasonable bundle impact
5. **Alternatives**: Consider native APIs first

### Version Pinning

```json
// package.json - Pin exact versions for reproducibility
{
  "dependencies": {
    "fastify": "4.26.0",
    "sharp": "0.33.2",
    "tesseract.js": "5.0.4"
  }
}
```

### Security Auditing

```bash
# Run in CI pipeline
pnpm audit --audit-level=moderate

# Update vulnerable packages
pnpm update --interactive
```

## Pre-Commit Hooks

```yaml
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

## CI Pipeline Quality Gates

```yaml
# .github/workflows/ci.yml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: pnpm install
      - run: pnpm run type-check    # TypeScript strict
      - run: pnpm run lint          # ESLint
      - run: pnpm run test          # Unit tests
      - run: pnpm run test:coverage # Coverage check

      # Fail if coverage drops
      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
```
