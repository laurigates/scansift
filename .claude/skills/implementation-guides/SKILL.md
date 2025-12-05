# PhotoScan Implementation Guides

Step-by-step patterns for implementing features in the PhotoScan application. Use when adding new functionality, implementing PRD user stories, or extending existing modules.

## Scanner Integration Implementation

### Adding eSCL Scanner Support

```typescript
// src/server/services/scanner/escl-scanner.ts
import Bonjour from 'bonjour-service';

interface ESCLScanner {
  name: string;
  url: string;
  capabilities: ScannerCapabilities;
}

export const createESCLScanner = () => {
  const discoverScanners = async (): Promise<ESCLScanner[]> => {
    const bonjour = new Bonjour();
    const scanners: ESCLScanner[] = [];

    return new Promise((resolve) => {
      const browser = bonjour.find({ type: 'uscan' });

      browser.on('up', async (service) => {
        const url = `http://${service.addresses[0]}:${service.port}`;
        const capabilities = await fetchCapabilities(url);
        scanners.push({ name: service.name, url, capabilities });
      });

      setTimeout(() => {
        browser.stop();
        resolve(scanners);
      }, 3000);
    });
  };

  const initiateScan = async (
    scannerUrl: string,
    options: ScanOptions
  ): Promise<ScanJob> => {
    const settings = buildScanSettingsXML(options);

    const response = await fetch(`${scannerUrl}/eSCL/ScanJobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: settings,
    });

    const location = response.headers.get('Location');
    if (!location) {
      throw new ScannerError('No scan job location returned');
    }

    return { id: extractJobId(location), url: location };
  };

  const downloadScan = async (jobUrl: string): Promise<Buffer> => {
    const response = await fetch(`${jobUrl}/NextDocument`);
    return Buffer.from(await response.arrayBuffer());
  };

  return { discoverScanners, initiateScan, downloadScan };
};
```

### eSCL Settings XML Builder

```typescript
// src/server/services/scanner/escl-settings.ts
export const buildScanSettingsXML = (options: ScanOptions): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
                   xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.0</pwg:Version>
  <scan:Intent>Photo</scan:Intent>
  <scan:DocumentFormat>image/jpeg</scan:DocumentFormat>
  <scan:XResolution>${options.resolution}</scan:XResolution>
  <scan:YResolution>${options.resolution}</scan:YResolution>
  <scan:ColorMode>RGB24</scan:ColorMode>
  <scan:InputSource>Platen</scan:InputSource>
</scan:ScanSettings>`;
};
```

## Photo Detection Implementation

### OpenCV-Based Detection

```typescript
// src/server/services/detection/photo-detector.ts
import cv from 'opencv4nodejs';

interface DetectedPhoto {
  image: Buffer;
  position: GridPosition;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
}

type GridPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const createPhotoDetector = (config: DetectionConfig) => {
  const detect = async (scanImage: Buffer): Promise<DetectedPhoto[]> => {
    // 1. Load and preprocess image
    const mat = cv.imdecode(scanImage);
    const gray = mat.cvtColor(cv.COLOR_BGR2GRAY);
    const blurred = gray.gaussianBlur(new cv.Size(5, 5), 0);

    // 2. Edge detection
    const edges = blurred.canny(config.cannyLow, config.cannyHigh);

    // 3. Find contours
    const contours = edges.findContours(
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // 4. Filter by size and shape
    const photoContours = contours.filter((contour) => {
      const area = contour.area;
      const approx = contour.approxPolyDP(
        contour.arcLength(true) * 0.02,
        true
      );
      return (
        area >= config.minArea &&
        area <= config.maxArea &&
        approx.length === 4 // Quadrilateral
      );
    });

    // 5. Sort by position (top-left to bottom-right)
    const sorted = sortByPosition(photoContours);

    // 6. Extract and deskew each photo
    return sorted.map((contour, index) => {
      const bounds = contour.boundingRect();
      const extracted = extractAndDeskew(mat, contour);
      return {
        image: cv.imencode('.jpg', extracted),
        position: indexToGridPosition(index),
        bounds,
        confidence: calculateConfidence(contour),
      };
    });
  };

  return { detect };
};

const sortByPosition = (contours: cv.Contour[]): cv.Contour[] => {
  return contours.sort((a, b) => {
    const boundsA = a.boundingRect();
    const boundsB = b.boundingRect();

    // Sort by row first (top to bottom), then column (left to right)
    const rowA = boundsA.y < 1000 ? 0 : 1; // Threshold for row detection
    const rowB = boundsB.y < 1000 ? 0 : 1;

    if (rowA !== rowB) return rowA - rowB;
    return boundsA.x - boundsB.x;
  });
};

const indexToGridPosition = (index: number): GridPosition => {
  const positions: GridPosition[] = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ];
  return positions[index] ?? 'top-left';
};
```

## Image Processing Pipeline

### Sharp-Based Enhancement

```typescript
// src/server/services/processing/image-processor.ts
import sharp from 'sharp';

interface ProcessingResult {
  processed: Buffer;
  original: Buffer;
  metadata: ImageMetadata;
}

export const createImageProcessor = () => {
  const process = async (
    image: Buffer,
    options: ProcessingOptions
  ): Promise<ProcessingResult> => {
    let pipeline = sharp(image);

    // 1. Auto-rotate based on EXIF
    pipeline = pipeline.rotate();

    // 2. Apply crop with margin
    if (options.crop) {
      pipeline = pipeline.extract({
        left: options.crop.x,
        top: options.crop.y,
        width: options.crop.width,
        height: options.crop.height,
      });
    }

    // 3. Color correction
    if (options.autoEnhance) {
      pipeline = pipeline
        .normalize() // Auto-contrast
        .modulate({
          brightness: 1.0,
          saturation: 1.1, // Slight saturation boost for faded photos
        });
    }

    // 4. Sharpening
    if (options.sharpen) {
      pipeline = pipeline.sharpen({
        sigma: 1.0,
        m1: 1.0,
        m2: 0.5,
      });
    }

    // 5. Output format
    const processed = await pipeline
      .jpeg({ quality: options.quality ?? 92 })
      .toBuffer();

    const metadata = await sharp(processed).metadata();

    return {
      processed,
      original: image,
      metadata: {
        width: metadata.width!,
        height: metadata.height!,
        format: 'jpeg',
      },
    };
  };

  return { process };
};
```

## OCR Implementation

### Tesseract.js Integration

```typescript
// src/server/services/ocr/ocr-service.ts
import Tesseract from 'tesseract.js';
import { parse as parseDate } from 'chrono-node';

interface OCRResult {
  text: string;
  confidence: number;
  extractedDate: Date | null;
  words: Array<{ text: string; confidence: number }>;
}

export const createOCRService = () => {
  let worker: Tesseract.Worker | null = null;

  const initialize = async () => {
    worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    });
  };

  const extractText = async (image: Buffer): Promise<OCRResult> => {
    if (!worker) await initialize();

    const {
      data: { text, confidence, words },
    } = await worker!.recognize(image);

    // Extract date patterns
    const dateResults = parseDate(text);
    const extractedDate = dateResults.length > 0 ? dateResults[0].date() : null;

    return {
      text: text.trim(),
      confidence: confidence / 100,
      extractedDate,
      words: words.map((w) => ({
        text: w.text,
        confidence: w.confidence / 100,
      })),
    };
  };

  const terminate = async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  };

  return { extractText, terminate };
};
```

## API Endpoint Implementation

### Fastify Route Pattern

```typescript
// src/server/api/scan.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const startScanSchema = z.object({
  type: z.enum(['front', 'back']),
  resolution: z.number().refine((n) => n === 300 || n === 600).default(300),
});

interface ScanRouteOptions {
  scanner: ScannerService;
  detector: PhotoDetector;
  db: Database;
}

export const scanRoutes: FastifyPluginAsync<ScanRouteOptions> = async (
  app,
  { scanner, detector, db }
) => {
  // POST /api/scan/start
  app.post('/start', async (request, reply) => {
    const body = startScanSchema.parse(request.body);

    // Check scanner availability
    const status = await scanner.getStatus();
    if (!status.available) {
      return reply.code(503).send({ error: 'Scanner not available' });
    }

    // Initiate scan
    const scanJob = await scanner.scan({
      resolution: body.resolution,
      colorMode: 'RGB24',
    });

    // Return job ID for polling
    return {
      scanId: scanJob.id,
      status: 'scanning',
    };
  });

  // GET /api/scan/:id/status
  app.get('/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };

    const status = await getScanStatus(id);
    if (!status) {
      return reply.code(404).send({ error: 'Scan not found' });
    }

    return status;
  });

  // GET /api/scan/:id/preview
  app.get('/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };

    const previews = await generatePreviews(id);
    return { previews: previews.map((p) => p.toString('base64')) };
  });
};
```

## WebSocket Real-Time Updates

### Socket.IO Integration

```typescript
// src/server/ws/scan-events.ts
import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';

export const setupWebSocket = (app: FastifyInstance) => {
  const io = new Server(app.server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('scan:start', async ({ scanType }) => {
      // Emit progress updates
      socket.emit('scan:progress', { scanId: 'xxx', progress: 0 });

      // ... perform scan

      socket.emit('scan:progress', { scanId: 'xxx', progress: 50 });

      // ... detect photos

      socket.emit('scan:complete', {
        scanId: 'xxx',
        photosDetected: 4,
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};
```

## Frontend Component Implementation

### React Component Pattern

```typescript
// src/client/components/ScanButton.tsx
import { useState } from 'react';
import { useScanStore } from '../stores/scan-store';

export const ScanButton = () => {
  const { state, startScan } = useScanStore();
  const isScanning = state.status !== 'idle' && state.status !== 'complete';

  const handleClick = async () => {
    if (isScanning) return;

    const scanType = state.status === 'ready_for_backs' ? 'back' : 'front';
    await startScan(scanType);
  };

  const buttonText = () => {
    switch (state.status) {
      case 'idle':
        return 'Scan Fronts';
      case 'ready_for_backs':
        return 'Scan Backs';
      case 'scanning_fronts':
      case 'scanning_backs':
        return 'Scanning...';
      case 'processing_fronts':
      case 'processing_backs':
        return 'Processing...';
      default:
        return 'Scan';
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isScanning}
      className="w-full py-6 px-8 text-2xl font-semibold rounded-xl
                 bg-blue-600 text-white
                 disabled:bg-gray-400 disabled:cursor-not-allowed
                 active:bg-blue-700 touch-manipulation"
    >
      {buttonText()}
    </button>
  );
};
```

### Zustand Store Pattern

```typescript
// src/client/stores/scan-store.ts
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface ScanStore {
  state: ScanState;
  socket: Socket | null;
  connect: () => void;
  startScan: (type: 'front' | 'back') => Promise<void>;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  state: { status: 'idle' },
  socket: null,

  connect: () => {
    const socket = io();

    socket.on('scan:progress', ({ scanId, progress }) => {
      set((state) => ({
        state: { ...state.state, progress },
      }));
    });

    socket.on('scan:complete', ({ scanId, photosDetected }) => {
      set({
        state: {
          status: 'ready_for_backs',
          frontScanId: scanId,
          photosDetected,
        },
      });
    });

    set({ socket });
  },

  startScan: async (type) => {
    const { socket } = get();
    socket?.emit('scan:start', { scanType: type });

    set({
      state: {
        status: type === 'front' ? 'scanning_fronts' : 'scanning_backs',
        scanId: 'pending',
      },
    });
  },
}));
```

## Database Operations

### Drizzle Schema and Queries

```typescript
// src/server/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frontFilePath: text('front_file_path').notNull(),
  backFilePath: text('back_file_path'),
  scanDate: text('scan_date').default(sql`CURRENT_TIMESTAMP`),
  photoDate: text('photo_date'),
  extractedText: text('extracted_text'),
  gridPosition: text('grid_position'),
  confidenceScore: real('confidence_score'),
});

// src/server/db/repositories/photo-repository.ts
import { eq, between } from 'drizzle-orm';
import { photos, NewPhoto, Photo } from '../schema';

export const createPhotoRepository = (db: DrizzleDB) => ({
  create: async (photo: NewPhoto): Promise<Photo> => {
    const [result] = await db.insert(photos).values(photo).returning();
    return result;
  },

  findByDateRange: async (start: Date, end: Date): Promise<Photo[]> => {
    return db
      .select()
      .from(photos)
      .where(between(photos.photoDate, start.toISOString(), end.toISOString()));
  },

  updateMetadata: async (
    id: number,
    metadata: { photoDate?: string; extractedText?: string }
  ): Promise<Photo> => {
    const [result] = await db
      .update(photos)
      .set(metadata)
      .where(eq(photos.id, id))
      .returning();
    return result;
  },
});
```

## File Organization Implementation

### Photo Storage Service

```typescript
// src/server/services/storage/file-storage.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface StoredPhoto {
  frontPath: string;
  backPath: string | null;
  metadataPath: string;
}

export const createFileStorage = (basePath: string) => {
  const savePhoto = async (
    photo: ProcessedPhoto,
    metadata: PhotoMetadata
  ): Promise<StoredPhoto> => {
    // Determine folder structure: YYYY/MM/
    const date = metadata.photoDate ?? new Date();
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    const folder = join(basePath, 'processed', year, month);
    await mkdir(folder, { recursive: true });

    // Generate filename: YYYY-MM-DD_SEQ_front/back.jpg
    const dateStr = date.toISOString().split('T')[0];
    const seq = await getNextSequence(folder, dateStr);
    const baseName = `${dateStr}_${seq.toString().padStart(3, '0')}`;

    // Save files
    const frontPath = join(folder, `${baseName}_front.jpg`);
    await writeFile(frontPath, photo.front);

    let backPath: string | null = null;
    if (photo.back) {
      backPath = join(folder, `${baseName}_back.jpg`);
      await writeFile(backPath, photo.back);
    }

    // Save metadata JSON
    const metadataPath = join(folder, `${baseName}.json`);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return { frontPath, backPath, metadataPath };
  };

  return { savePhoto };
};
```
