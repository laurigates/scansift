# PhotoScan Architecture Patterns

Architecture patterns and conventions for the PhotoScan application. Use when implementing new features, creating modules, or making architectural decisions.

## System Architecture

PhotoScan uses a **client-server architecture** with local deployment:

```
┌─────────────────────────────────────────────┐
│  Client Layer (Mobile/Desktop Browser)     │
│  - React + TypeScript + Vite               │
│  - Tailwind CSS + Radix UI                 │
│  - Zustand state management                │
│  - WebSocket for real-time updates         │
└─────────────────┬───────────────────────────┘
                  │ HTTP/WebSocket
┌─────────────────▼───────────────────────────┐
│  Application Server (Node.js + TypeScript) │
│  - Fastify REST API                        │
│  - WebSocket server                        │
│  - Scan orchestration logic                │
└─────────┬──────────────────┬────────────────┘
          │                  │
┌─────────▼────────┐  ┌─────▼──────────────────┐
│  Scanner Layer   │  │  Processing Pipeline   │
│  - eSCL client   │  │  - Sharp.js            │
│  - SANE fallback │  │  - OpenCV              │
│  - mDNS discovery│  │  - Tesseract.js        │
└──────────────────┘  └─────┬──────────────────┘
                            │
                      ┌─────▼──────────────────┐
                      │  Storage Layer         │
                      │  - File system         │
                      │  - SQLite + Drizzle    │
                      └────────────────────────┘
```

## Directory Structure

```
photoscan/
├── src/
│   ├── server/                 # Backend (Fastify)
│   │   ├── api/               # REST API routes
│   │   │   ├── scan.ts        # Scan endpoints
│   │   │   ├── status.ts      # Status endpoints
│   │   │   └── index.ts       # Route registration
│   │   ├── services/          # Business logic
│   │   │   ├── scanner/       # Scanner communication
│   │   │   ├── detection/     # Photo detection
│   │   │   ├── processing/    # Image processing
│   │   │   └── ocr/           # OCR extraction
│   │   ├── db/                # Database layer
│   │   │   ├── schema.ts      # Drizzle schema
│   │   │   ├── migrations/    # SQL migrations
│   │   │   └── index.ts       # DB connection
│   │   ├── ws/                # WebSocket handlers
│   │   └── index.ts           # Server entry point
│   ├── client/                # Frontend (React)
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom hooks
│   │   ├── stores/            # Zustand stores
│   │   ├── pages/             # Page components
│   │   └── main.tsx           # Client entry point
│   └── shared/                # Shared types/utils
│       ├── types.ts           # Shared TypeScript types
│       └── constants.ts       # Shared constants
├── tests/
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   └── e2e/                   # Playwright E2E tests
└── public/                    # Static assets
```

## Design Patterns

### Service Layer Pattern

All business logic lives in services, not in API routes:

```typescript
// src/server/services/scanner/scanner-service.ts
export interface ScannerService {
  discover(): Promise<Scanner[]>;
  scan(options: ScanOptions): Promise<ScanResult>;
  getStatus(): Promise<ScannerStatus>;
}

export const createScannerService = (
  deps: ScannerDependencies
): ScannerService => ({
  discover: async () => {
    // Implementation
  },
  scan: async (options) => {
    // Implementation
  },
  getStatus: async () => {
    // Implementation
  },
});
```

### Factory Pattern for Services

Use factory functions instead of classes:

```typescript
// Good: Factory function
export const createPhotoDetector = (
  opencv: OpenCV,
  config: DetectionConfig
): PhotoDetector => {
  return {
    detect: async (image: Buffer) => {
      // Use closure for dependencies
    },
  };
};

// Avoid: Class with constructor injection
class PhotoDetector {
  constructor(private opencv: OpenCV) {}
}
```

### State Machine for Scan Workflow

```typescript
// src/shared/types.ts
type ScanState =
  | { status: 'idle' }
  | { status: 'scanning_fronts'; scanId: string }
  | { status: 'processing_fronts'; scanId: string; progress: number }
  | { status: 'ready_for_backs'; frontScanId: string; photosDetected: number }
  | { status: 'scanning_backs'; frontScanId: string; backScanId: string }
  | { status: 'processing_backs'; frontScanId: string; backScanId: string }
  | { status: 'saving'; batchId: string }
  | { status: 'complete'; batchId: string; photosSaved: number }
  | { status: 'error'; message: string; recoverable: boolean };
```

### Repository Pattern for Data Access

```typescript
// src/server/db/repositories/photo-repository.ts
export interface PhotoRepository {
  create(photo: NewPhoto): Promise<Photo>;
  findById(id: number): Promise<Photo | null>;
  findByDateRange(start: Date, end: Date): Promise<Photo[]>;
  update(id: number, data: Partial<Photo>): Promise<Photo>;
}

export const createPhotoRepository = (db: DrizzleDB): PhotoRepository => ({
  create: async (photo) => {
    const [result] = await db.insert(photos).values(photo).returning();
    return result;
  },
  // ... other methods
});
```

## API Design

### REST Endpoints

Follow resource-oriented design:

```
POST   /api/scan/start          # Start a new scan
GET    /api/scan/:id/status     # Get scan status
GET    /api/scan/:id/preview    # Get preview thumbnails
POST   /api/scan/pair           # Pair fronts with backs
GET    /api/scanner/status      # Get scanner availability
GET    /api/stats               # Get session statistics
```

### Request/Response Types

Use Zod for validation and type inference:

```typescript
// src/server/api/scan.ts
import { z } from 'zod';

const startScanSchema = z.object({
  type: z.enum(['front', 'back']),
  resolution: z.enum([300, 600]).default(300),
});

type StartScanRequest = z.infer<typeof startScanSchema>;
```

### WebSocket Events

```typescript
// Server -> Client events
type ServerEvent =
  | { type: 'scan:progress'; scanId: string; progress: number }
  | { type: 'scan:complete'; scanId: string; photos: number }
  | { type: 'scan:error'; scanId: string; message: string }
  | { type: 'scanner:status'; available: boolean };

// Client -> Server events
type ClientEvent =
  | { type: 'scan:start'; scanType: 'front' | 'back' }
  | { type: 'scan:cancel'; scanId: string };
```

## Error Handling

### Fail-Fast Approach

Let errors surface immediately:

```typescript
// Good: Fail fast, propagate errors
const initiateScan = async (scanner: Scanner): Promise<ScanJob> => {
  const job = await scanner.createJob(settings);
  if (!job.id) {
    throw new ScannerError('Failed to create scan job', { recoverable: true });
  }
  return job;
};

// Avoid: Swallowing errors
const initiateScan = async (scanner: Scanner): Promise<ScanJob | null> => {
  try {
    return await scanner.createJob(settings);
  } catch {
    return null; // Error information lost
  }
};
```

### Custom Error Types

```typescript
// src/server/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ScannerError extends AppError {
  constructor(message: string, options?: { recoverable?: boolean }) {
    super(message, 'SCANNER_ERROR', options?.recoverable);
  }
}

export class DetectionError extends AppError {
  constructor(message: string, public readonly photosDetected: number) {
    super(message, 'DETECTION_ERROR', true);
  }
}
```

## Dependency Injection

Use function parameters, not globals:

```typescript
// src/server/index.ts
const createApp = async () => {
  // Create dependencies
  const db = await createDatabase(paths.database);
  const scanner = await createScannerService({ discovery: bonjour });
  const detector = createPhotoDetector(opencv, config);

  // Inject into API routes
  const app = fastify();
  app.register(scanRoutes, { scanner, detector, db });

  return app;
};
```

## File Organization Conventions

- One module per file (no barrel exports with side effects)
- Co-locate tests with source files or in parallel `tests/` tree
- Types in `types.ts` files, shared types in `src/shared/`
- Constants in `constants.ts` files
- Use `index.ts` only for re-exports, not implementation
