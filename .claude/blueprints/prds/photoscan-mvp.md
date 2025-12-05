# PhotoScan MVP - Product Requirements Document

## Executive Summary

### Problem Statement
Digitizing physical photo collections is time-consuming and inefficient with current solutions. Users face multiple pain points:
- **Manual inefficiency**: Scanning photos one at a time is tedious and slow
- **Physical interruption**: Constantly moving between scanner and computer breaks workflow
- **Missing context**: Photo backs often contain valuable metadata (dates, names, locations) that gets lost
- **Quality degradation**: Old photos suffer from fading, scratches, and color shifts
- **Disorganization**: Scanned photos require manual sorting and metadata entry

### Proposed Solution
PhotoScan is a network-enabled batch photo scanning application optimized for efficient, high-quality digitization of physical photo collections. The solution enables:
- **Batch scanning**: Scan 4 photos at once on flatbed scanner
- **Dual-sided capture**: Automatically guide users to scan both fronts and backs
- **Mobile-first workflow**: Control scanning from mobile device while staying at scanner
- **Intelligent processing**: Auto-detect, crop, enhance, and organize photos automatically
- **Local privacy**: All processing happens on local network without cloud uploads

### Business Impact
- **Efficiency gain**: 4x throughput compared to single-photo scanning
- **Quality improvement**: AI-powered restoration and enhancement
- **Metadata preservation**: OCR extraction from photo backs captures historical context
- **User satisfaction**: Streamlined workflow reduces frustration and increases completion rates

## Stakeholders & Personas

### Primary Stakeholders
- **Product Owner**: Responsible for feature prioritization and MVP scope (Accountable)
- **Engineering Team**: Responsible for implementation (Responsible)
- **End Users**: Primary users scanning photo collections (Consulted)

### User Personas

#### Persona 1: The Family Historian
- **Name**: Sarah, 45-year-old homemaker
- **Context**: Inherited boxes of family photos spanning 3 generations
- **Technical Proficiency**: Moderate - comfortable with mobile apps, less so with desktop software
- **Pain Points**:
  - Overwhelmed by volume (2000+ photos to digitize)
  - Fears losing handwritten notes on photo backs
  - Limited time blocks (30-60 minutes at a time)
  - Wants photos organized by date/person
- **Goals**:
  - Preserve family memories before photos deteriorate further
  - Share digital collection with siblings and children
  - Maintain historical context (who, when, where)
- **Success Criteria**: Can scan 100+ photos in a focused 1-hour session

#### Persona 2: The Efficiency Optimizer
- **Name**: David, 35-year-old software engineer
- **Context**: Scanning personal photo collection from childhood/college
- **Technical Proficiency**: High - comfortable with command-line tools and technical configuration
- **Pain Points**:
  - Current scanning workflow is painfully slow
  - Frustrated by need to move between scanner and computer
  - Wants automation and batch processing
- **Goals**:
  - Minimize manual intervention and repetitive tasks
  - Achieve highest quality scans possible
  - Organize output in logical file structure
- **Success Criteria**: Can scan entire collection (500 photos) over a weekend with minimal manual work

### Stakeholder Matrix (RACI)

| Activity | Product Owner | Engineering | End Users | Scanner Hardware |
|----------|--------------|-------------|-----------|------------------|
| Requirements definition | A | R | C | I |
| Technical architecture | C | A/R | I | I |
| Implementation | I | A/R | I | I |
| Testing & validation | C | R | C | I |
| Deployment | A | R | I | I |
| User feedback collection | R | C | C | I |

### User Stories with Acceptance Criteria

#### Epic 1: Batch Scanning Workflow

**US-1.1: As a user, I want to scan 4 photos at once so that I can digitize my collection faster**
- **Acceptance Criteria**:
  - [ ] User can place 4 photos on scanner flatbed in any reasonable arrangement
  - [ ] System detects all 4 photos with 95%+ accuracy
  - [ ] Each photo is saved as separate image file
  - [ ] Process completes in under 60 seconds from scan initiation to saved files
- **Priority**: P0 (Must-have for MVP)

**US-1.2: As a user, I want to trigger scans from my phone so that I can stay at the scanner**
- **Acceptance Criteria**:
  - [ ] Web interface loads on mobile devices (iOS Safari, Android Chrome)
  - [ ] Large, touch-friendly "Scan" button accessible from mobile
  - [ ] Scan initiates within 2 seconds of button press
  - [ ] No need to return to computer between scans
- **Priority**: P0 (Must-have for MVP)

**US-1.3: As a user, I want to scan both fronts and backs of photos so that I preserve handwritten notes**
- **Acceptance Criteria**:
  - [ ] After front scan completes, UI prompts user to flip photos
  - [ ] Visual guide shows photo positions to maintain pairing
  - [ ] Back scan captures same 4 photo positions
  - [ ] System pairs fronts with backs automatically based on position
- **Priority**: P0 (Must-have for MVP)

**US-1.4: As a user, I want clear visual feedback so that I know what's happening during scanning**
- **Acceptance Criteria**:
  - [ ] Progress indicator shows: "Scanning...", "Processing...", "Complete"
  - [ ] Completion notification with count: "4 photos saved"
  - [ ] Error states clearly communicated (scanner unavailable, only 3 photos detected, etc.)
  - [ ] Preview thumbnails of detected photos shown within 5 seconds
- **Priority**: P0 (Must-have for MVP)

#### Epic 2: Image Processing & Enhancement

**US-2.1: As a user, I want photos automatically cropped so that I don't have manual cleanup work**
- **Acceptance Criteria**:
  - [ ] Each photo cropped to edges with <5% margin error
  - [ ] Rotation correction applied (deskew)
  - [ ] White balance and color correction applied automatically
  - [ ] User can review/adjust crops before final save (MVP: auto-accept)
- **Priority**: P0 for basic crop, P1 for manual adjustment

**US-2.2: As a user, I want faded photos enhanced so that they look better than the originals**
- **Acceptance Criteria**:
  - [ ] Automatic contrast and brightness adjustment
  - [ ] Color restoration for faded vintage photos
  - [ ] Sharpening applied to slightly blurry scans
  - [ ] Before/after comparison available (MVP: automatic application)
- **Priority**: P1 (Should-have for MVP)

**US-2.3: As a user, I want scratches and damage removed so that I have clean digital copies**
- **Acceptance Criteria**:
  - [ ] AI-powered scratch removal applied automatically
  - [ ] Dust spot removal
  - [ ] Crease and fold line reduction
  - [ ] Quality setting: Light/Medium/Heavy restoration
- **Priority**: P2 (Post-MVP enhancement)

#### Epic 3: Metadata Extraction & Organization

**US-3.1: As a user, I want dates extracted from photo backs so that I can organize chronologically**
- **Acceptance Criteria**:
  - [ ] OCR extracts printed and handwritten text from backs
  - [ ] Date patterns recognized (MM/DD/YYYY, Month Year, etc.)
  - [ ] Extracted dates set as file creation date metadata
  - [ ] Confidence score shown for OCR results
- **Priority**: P1 (Should-have for MVP)

**US-3.2: As a user, I want names extracted from photo backs so that I can identify people**
- **Acceptance Criteria**:
  - [ ] Text extraction identifies name-like patterns
  - [ ] Names stored in IPTC/EXIF keywords metadata
  - [ ] User can review and confirm extracted names
  - [ ] Unknown text preserved in description field
- **Priority**: P2 (Post-MVP)

**US-3.3: As a user, I want photos organized automatically so that I can find them easily**
- **Acceptance Criteria**:
  - [ ] Files organized in folders by year (from extracted dates)
  - [ ] Naming convention: YYYY-MM-DD_NNN_front/back.jpg
  - [ ] Sidecar JSON file with all extracted metadata
  - [ ] Original unprocessed scans preserved in separate folder
- **Priority**: P1 (Should-have for MVP)

### User Journey Mapping

#### Primary Journey: Batch Scanning Session

```
[User arrives at scanner with box of photos]
         ↓
[Opens PhotoScan web app on phone/tablet]
         ↓
[Selects 4 photos, arranges on scanner flatbed]
         ↓
[Taps "Scan Fronts" button on phone]
         ↓
[Scanner activates - visual feedback on phone: "Scanning..."]
         ↓
[Processing happens - preview thumbnails appear: "Detecting photos..."]
         ↓
[Phone displays: "4 photos detected - Please flip and scan backs"]
         ↓
[User flips photos in place, maintains positions]
         ↓
[Taps "Scan Backs" button on phone]
         ↓
[Scanner activates again - "Scanning backs..."]
         ↓
[Processing completes - "4 photos saved! Total: 47 photos scanned"]
         ↓
[User removes completed photos, places next 4]
         ↓
[Repeat cycle...]
```

#### Pain Points in Journey:
1. **Position memory**: User must remember/maintain photo positions when flipping
   - *Mitigation*: Visual grid overlay showing numbered positions
2. **Detection failures**: What if only 3 photos detected?
   - *Mitigation*: Clear error message with option to rescan or continue
3. **Scanner busy**: What if scanner is processing when user taps scan?
   - *Mitigation*: Button disabled with "Processing..." state

## Functional Requirements

### Core Functionality

#### FR-1: Network Scanner Integration
- **FR-1.1**: System shall discover Epson ET-3750 scanner on local network automatically
- **FR-1.2**: System shall communicate with scanner using eSCL (AirPrint) protocol as primary method
- **FR-1.3**: System shall fall back to SANE backend if eSCL unavailable
- **FR-1.4**: System shall support scan resolution of 300 DPI (default) and 600 DPI (high quality)
- **FR-1.5**: System shall scan in color (24-bit RGB) by default
- **FR-1.6**: System shall provide scanner status feedback (ready, busy, error, offline)

#### FR-2: Batch Photo Detection
- **FR-2.1**: System shall detect between 1-4 photos in single flatbed scan
- **FR-2.2**: System shall use edge detection algorithm to identify photo boundaries
- **FR-2.3**: System shall handle photos in portrait or landscape orientation
- **FR-2.4**: System shall detect photos with 5-95% confidence threshold
- **FR-2.5**: System shall handle photos placed at any angle (rotation up to 45°)
- **FR-2.6**: System shall separate detected photos into individual image files
- **FR-2.7**: System shall preserve spatial position metadata for front/back pairing

#### FR-3: Front/Back Pairing
- **FR-3.1**: System shall maintain position grid (2x2) for photo placement
- **FR-3.2**: System shall match front photos to back photos based on grid position
- **FR-3.3**: System shall handle missing backs (some photos without backs)
- **FR-3.4**: System shall provide visual guide showing position numbers (1-4)
- **FR-3.5**: System shall allow manual pairing override if auto-pairing fails
- **FR-3.6**: System shall save front/back pairs with linked filenames

#### FR-4: Web Interface
- **FR-4.1**: System shall provide responsive web UI accessible from mobile devices
- **FR-4.2**: System shall run web server on local network (http://photoscan.local or IP)
- **FR-4.3**: System shall provide large touch-friendly buttons (minimum 44x44pt)
- **FR-4.4**: System shall display real-time scanning progress
- **FR-4.5**: System shall show preview thumbnails of detected photos
- **FR-4.6**: System shall display session statistics (total photos scanned, time elapsed)
- **FR-4.7**: System shall provide settings page for configuration
- **FR-4.8**: System shall work without internet connection (local-only)

#### FR-5: Image Processing Pipeline
- **FR-5.1**: System shall auto-crop photos to detected boundaries with 2% margin
- **FR-5.2**: System shall apply automatic rotation/deskew correction
- **FR-5.3**: System shall apply automatic white balance correction
- **FR-5.4**: System shall apply contrast and brightness enhancement
- **FR-5.5**: System shall save processed images as JPEG (quality: 92%)
- **FR-5.6**: System shall optionally save as PNG for lossless archival
- **FR-5.7**: System shall preserve original unprocessed scan in separate folder

#### FR-6: OCR & Metadata Extraction
- **FR-6.1**: System shall perform OCR on photo backs using Tesseract OCR
- **FR-6.2**: System shall extract date patterns from OCR text
- **FR-6.3**: System shall write extracted metadata to EXIF/IPTC tags
- **FR-6.4**: System shall save metadata as sidecar JSON file
- **FR-6.5**: System shall preserve all extracted text even if not parsed

#### FR-7: File Organization
- **FR-7.1**: System shall organize photos into date-based folder structure
- **FR-7.2**: System shall use naming convention: `YYYY-MM-DD_SEQ_front.jpg` / `YYYY-MM-DD_SEQ_back.jpg`
- **FR-7.3**: System shall handle photos without dates (unknown folder)
- **FR-7.4**: System shall prevent filename collisions with sequence numbers
- **FR-7.5**: System shall maintain index database of all scanned photos

### Feature Specifications

#### Scan Workflow State Machine

```
[IDLE]
  ↓ (User taps "Scan Fronts")
[SCANNING_FRONTS]
  ↓ (Scanner completes)
[PROCESSING_FRONTS]
  ↓ (Detection complete)
[READY_FOR_BACKS] ← Shows "Flip photos and scan backs"
  ↓ (User taps "Scan Backs")
[SCANNING_BACKS]
  ↓ (Scanner completes)
[PROCESSING_BACKS]
  ↓ (Pairing and enhancement complete)
[SAVING]
  ↓ (Files written)
[COMPLETE] → Returns to [IDLE]

Error states at any stage → [ERROR] → Can retry or skip
```

#### Photo Detection Algorithm

**Approach**: Computer vision edge detection with contour analysis

**Steps**:
1. Convert scan to grayscale
2. Apply Gaussian blur to reduce noise
3. Use Canny edge detection to find edges
4. Find contours from edge map
5. Filter contours by area (minimum size: 2" x 2" at scan DPI)
6. Approximate contours to quadrilaterals
7. Sort by position (top-left to bottom-right)
8. Extract and deskew each photo region
9. Return array of photo images with position metadata

**Libraries**: OpenCV.js or @techstark/opencv-js for browser-based processing, or opencv4nodejs for Node.js backend

**Parameters**:
- Minimum photo size: 2" x 2" (1800x1800 pixels at 300 DPI)
- Maximum photo size: 6" x 6" (5400x5400 pixels at 300 DPI)
- Edge detection threshold: Canny low=50, high=150
- Contour approximation epsilon: 0.02 * perimeter

#### Front/Back Pairing Strategy

**Primary Strategy**: Position-based pairing
- Assign grid positions 1-4 (top-left, top-right, bottom-left, bottom-right)
- Match fronts to backs using same grid position
- Store position in metadata during detection phase

**Fallback Strategy**: User confirmation
- If detection count mismatch (e.g., 4 fronts but 3 backs), prompt user
- Show side-by-side preview of questionable pairs
- Allow manual pairing via drag-and-drop interface

**Edge Cases**:
- Missing backs: Save front-only photos without error
- Extra photos: Warn user if back scan detects more than front scan
- Position shift: Allow tolerance of 10% position deviation

### API Requirements

#### Internal REST API

**Endpoint**: `POST /api/scan/start`
- **Request**: `{ "type": "front" | "back", "resolution": 300 | 600 }`
- **Response**: `{ "scanId": "uuid", "status": "scanning" }`

**Endpoint**: `GET /api/scan/status/:scanId`
- **Response**: `{ "status": "scanning" | "processing" | "complete", "progress": 0-100, "photosDetected": 4 }`

**Endpoint**: `GET /api/scan/preview/:scanId`
- **Response**: Array of base64-encoded thumbnail images

**Endpoint**: `POST /api/scan/pair`
- **Request**: `{ "frontScanId": "uuid", "backScanId": "uuid" }`
- **Response**: `{ "pairedPhotos": 4, "saved": true }`

**Endpoint**: `GET /api/stats`
- **Response**: `{ "totalPhotos": 147, "sessionPhotos": 48, "sessionStartTime": "ISO-8601" }`

**Endpoint**: `GET /api/scanner/status`
- **Response**: `{ "available": true, "model": "Epson ET-3750", "ip": "192.168.1.100" }`

## Non-Functional Requirements

### Performance Requirements

- **NFR-1.1**: Scan initiation latency < 2 seconds from button press to scanner activation
- **NFR-1.2**: Photo detection processing time < 15 seconds for 4 photos at 300 DPI
- **NFR-1.3**: Total cycle time (scan + process + save) < 60 seconds for 4 photos
- **NFR-1.4**: Web interface page load time < 1 second on local network
- **NFR-1.5**: Preview thumbnail generation < 5 seconds
- **NFR-1.6**: System shall handle 1000+ photos in single session without performance degradation

### Reliability Requirements

- **NFR-2.1**: Scanner connection failure shall not crash application
- **NFR-2.2**: System shall recover gracefully from mid-scan errors
- **NFR-2.3**: Partial results shall be saved if processing fails on some photos
- **NFR-2.4**: System shall maintain operation log for troubleshooting
- **NFR-2.5**: Uptime target: 99% during scanning sessions

### Scalability Requirements

- **NFR-3.1**: System shall handle photo collections up to 10,000+ photos
- **NFR-3.2**: Database queries shall remain performant with large photo counts
- **NFR-3.3**: Storage requirements: ~5MB per photo pair (front + back at 300 DPI)

### Security Considerations

- **NFR-4.1**: Web interface shall be accessible only on local network (no public exposure)
- **NFR-4.2**: No authentication required for MVP (single-user, local environment)
- **NFR-4.3**: Optional: Basic authentication for multi-user households
- **NFR-4.4**: All photo data stored locally (no cloud uploads)
- **NFR-4.5**: File permissions: User read/write only (no world-readable)

### Accessibility Standards

- **NFR-5.1**: Web interface shall meet WCAG 2.1 Level AA standards
- **NFR-5.2**: Touch targets minimum 44x44 points for mobile usability
- **NFR-5.3**: Color contrast ratio minimum 4.5:1 for text
- **NFR-5.4**: Screen reader support for status updates
- **NFR-5.5**: Keyboard navigation support for desktop access

### Usability Requirements

- **NFR-6.1**: First-time users shall complete first scan within 5 minutes without documentation
- **NFR-6.2**: Error messages shall be clear and actionable (no technical jargon)
- **NFR-6.3**: Visual feedback for all user actions within 200ms
- **NFR-6.4**: Progressive disclosure: Advanced settings hidden by default

### Compatibility Requirements

- **NFR-7.1**: Support macOS 12+ (Monterey and later)
- **NFR-7.2**: Support Ubuntu 20.04+ and Debian 11+
- **NFR-7.3**: Support Windows 10/11
- **NFR-7.4**: Mobile web support: iOS 14+ Safari, Android Chrome 90+
- **NFR-7.5**: Desktop browser support: Chrome, Firefox, Safari, Edge (latest 2 versions)

## Technical Considerations

### Architecture Implications

**System Architecture**: Client-Server with local deployment

```
┌─────────────────────────────────────────────┐
│  Client Layer (Mobile/Desktop Browser)     │
│  - Responsive Web UI (React + TypeScript)  │
│  - Socket.IO for real-time updates         │
└─────────────────┬───────────────────────────┘
                  │ HTTP/WS
┌─────────────────▼───────────────────────────┐
│  Application Server (Node.js + TypeScript) │
│  - Fastify REST API                        │
│  - Socket.IO server                        │
│  - Scan orchestration logic                │
│  - State management                        │
└─────────┬──────────────────┬────────────────┘
          │                  │
          │                  │ File I/O
┌─────────▼────────┐  ┌─────▼──────────────────┐
│  Scanner Layer   │  │  Processing Pipeline   │
│  - eSCL client   │  │  - Sharp.js            │
│  - SANE wrapper  │  │  - Tesseract.js        │
│  - mDNS discovery│  │  - Image enhancement   │
└──────────────────┘  └─────┬──────────────────┘
                            │
                      ┌─────▼──────────────────┐
                      │  Storage Layer         │
                      │  - File system         │
                      │  - Better-SQLite3      │
                      │  - Metadata store      │
                      └────────────────────────┘
```

### Technology Stack (TypeScript Full-Stack)

#### Runtime Environment
- **Node.js**: v20.x LTS (Long-term support, current LTS as of January 2025)
  - **Status**: Active, maintained by OpenJS Foundation
  - **Version**: 20.11.0 or later
  - **Why**: Stable LTS with excellent TypeScript support, native ESM modules

#### Backend Stack

**Core Framework & Server**
- **Fastify**: ^4.26.0 (Latest v4 stable)
  - **Status**: Very active, 10k+ commits, maintained by Fastify team
  - **Why**: Fastest Node.js framework, excellent TypeScript support, schema validation
  - **GitHub**: fastify/fastify
- **TypeScript**: ^5.3.3 (Latest stable)
  - **Status**: Active, maintained by Microsoft
  - **Why**: Type safety, modern language features, excellent tooling
- **tsx**: ^4.7.0 (TypeScript execution)
  - **Status**: Active, modern alternative to ts-node
  - **Why**: Fast TypeScript execution for development, ESM support

**Web Server & Real-Time**
- **@fastify/static**: ^7.0.0
  - **Status**: Official Fastify plugin, actively maintained
  - **Why**: Serve static frontend files
- **@fastify/websocket**: ^10.0.0
  - **Status**: Official Fastify plugin
  - **Why**: WebSocket support for real-time updates
  - **Alternative**: socket.io ^4.7.0 if more features needed

**Scanner Communication**
- **ipp**: ^2.0.1 (IPP/eSCL protocol)
  - **Status**: Active, used in CUPS ecosystem
  - **Why**: IPP (Internet Printing Protocol) client for eSCL scanning
  - **GitHub**: williamkapke/ipp
- **bonjour-service**: ^1.2.0 (mDNS/Bonjour discovery)
  - **Status**: Active fork of original bonjour package
  - **Why**: Scanner discovery on local network
  - **GitHub**: onlxltd/bonjour-service
- **node-sane**: ^2.0.0 (SANE fallback)
  - **Status**: Active wrapper for SANE backends
  - **Why**: Fallback scanner support via SANE
  - **Note**: Requires SANE libraries installed on system

**Image Processing**
- **sharp**: ^0.33.2 (Latest stable)
  - **Status**: Very active, 28k+ stars, maintained by Lovell Fuller
  - **Why**: High-performance image processing (libvips), supports resize, crop, color correction
  - **GitHub**: lovell/sharp
  - **Features**: WebP/JPEG/PNG, metadata editing, performance
- **opencv4nodejs**: ^6.1.0 (OpenCV bindings)
  - **Status**: Active, maintained community fork
  - **Why**: Advanced computer vision for photo detection
  - **GitHub**: UrielCh/opencv4nodejs
  - **Note**: Requires OpenCV system libraries
  - **Alternative**: @techstark/opencv-js ^4.9.0-release.1 (WebAssembly, no system deps)

**OCR & Text Extraction**
- **tesseract.js**: ^5.0.4 (Latest stable)
  - **Status**: Very active, 33k+ stars
  - **Why**: Pure JavaScript OCR, no system dependencies
  - **GitHub**: naptha/tesseract.js
  - **Features**: Handwriting support, multiple languages
- **chrono-node**: ^2.7.0 (Date parsing)
  - **Status**: Active, 2.6k+ stars
  - **Why**: Natural language date parsing
  - **GitHub**: wanasit/chrono

**Database**
- **better-sqlite3**: ^9.3.0 (Latest stable)
  - **Status**: Very active, maintained by WiseLibs
  - **Why**: Fastest SQLite library for Node.js, synchronous API, full-featured
  - **GitHub**: WiseLibs/better-sqlite3
- **drizzle-orm**: ^0.29.3 (TypeScript ORM)
  - **Status**: Very active, modern TypeScript-first ORM
  - **Why**: Excellent TypeScript support, zero runtime overhead, SQL-like syntax
  - **GitHub**: drizzle-team/drizzle-orm
  - **Alternative**: Kysely ^0.27.0 (type-safe SQL query builder)

**Metadata & EXIF**
- **exifreader**: ^4.21.0 (Latest stable)
  - **Status**: Active, 3.7k+ stars
  - **Why**: Read/write EXIF, IPTC, XMP metadata
  - **GitHub**: mattiasw/ExifReader
- **piexifjs**: ^1.0.7 (EXIF writing)
  - **Status**: Stable, focused on EXIF writing
  - **Why**: Write EXIF metadata to JPEG files
  - **GitHub**: hMatoba/piexifjs

**Utilities**
- **zod**: ^3.22.4 (Schema validation)
  - **Status**: Very active, 30k+ stars
  - **Why**: TypeScript-first schema validation
  - **GitHub**: colinhacks/zod
- **pino**: ^8.17.2 (Logging)
  - **Status**: Very active, official Fastify logger
  - **Why**: Fast structured logging, JSON output
  - **GitHub**: pinojs/pino
- **dotenv**: ^16.4.1 (Environment variables)
  - **Status**: Stable, widely used
  - **Why**: Load environment configuration

#### Frontend Stack

**Framework & Build**
- **React**: ^18.2.0 (Latest stable)
  - **Status**: Very active, maintained by Meta
  - **Why**: Industry standard, excellent ecosystem, hooks API
- **TypeScript**: ^5.3.3
  - **Status**: Active, maintained by Microsoft
  - **Why**: Type safety across full stack
- **Vite**: ^5.0.12 (Latest stable)
  - **Status**: Very active, 65k+ stars
  - **Why**: Fastest build tool, excellent DX, native ESM
  - **GitHub**: vitejs/vite

**UI & Styling**
- **Tailwind CSS**: ^3.4.1 (Latest v3)
  - **Status**: Very active, 78k+ stars
  - **Why**: Utility-first CSS, mobile-first, excellent DX
  - **GitHub**: tailwindlabs/tailwindcss
- **Radix UI**: ^1.1.1 (Primitives)
  - **Status**: Very active, maintained by WorkOS
  - **Why**: Unstyled, accessible components
  - **GitHub**: radix-ui/primitives
  - **Components**: @radix-ui/react-dialog, @radix-ui/react-progress, etc.

**State Management**
- **Zustand**: ^4.5.0 (Latest stable)
  - **Status**: Very active, 43k+ stars
  - **Why**: Simple, minimal boilerplate, excellent TypeScript support
  - **GitHub**: pmndrs/zustand
  - **Alternative**: TanStack Query ^5.17.0 for server state

**Real-Time Communication**
- **socket.io-client**: ^4.7.0
  - **Status**: Very active, maintained by Socket.IO team
  - **Why**: Real-time bidirectional communication
  - **GitHub**: socketio/socket.io

**HTTP Client**
- **ky**: ^1.2.0
  - **Status**: Active, modern fetch wrapper
  - **Why**: Better than axios for modern browsers, tiny size
  - **GitHub**: sindresorhus/ky
  - **Alternative**: @tanstack/react-query ^5.17.0 includes fetching

**Utilities**
- **date-fns**: ^3.2.0 (Latest v3)
  - **Status**: Very active, 33k+ stars
  - **Why**: Modern date utility library, tree-shakeable
  - **GitHub**: date-fns/date-fns

#### Development Tools

**Build & Bundling**
- **tsup**: ^8.0.1
  - **Status**: Active, modern TypeScript bundler
  - **Why**: Bundle backend TypeScript for distribution
  - **GitHub**: egoist/tsup
- **esbuild**: ^0.20.0
  - **Status**: Very active, used by Vite
  - **Why**: Extremely fast JavaScript bundler

**Testing**
- **Vitest**: ^1.2.0
  - **Status**: Very active, by Vite team
  - **Why**: Fast, Vite-native test runner, Jest-compatible API
  - **GitHub**: vitest-dev/vitest
- **@testing-library/react**: ^14.1.2
  - **Status**: Very active, standard for React testing
  - **Why**: User-centric testing approach
- **playwright**: ^1.41.0
  - **Status**: Very active, maintained by Microsoft
  - **Why**: E2E testing across browsers
  - **GitHub**: microsoft/playwright

**Code Quality**
- **ESLint**: ^8.56.0
  - **Status**: Active, standard linting tool
  - **Why**: Code quality and consistency
  - **Plugins**: @typescript-eslint/eslint-plugin ^6.19.0
- **Prettier**: ^3.2.4
  - **Status**: Active, standard formatting tool
  - **Why**: Consistent code formatting
- **lint-staged**: ^15.2.0
  - **Status**: Active, run linters on staged files
  - **Why**: Pre-commit hook integration
- **husky**: ^9.0.0
  - **Status**: Active, Git hooks manager
  - **Why**: Enforce quality gates via Git hooks

**Package Management**
- **pnpm**: ^8.15.0 (Recommended)
  - **Status**: Very active, 28k+ stars
  - **Why**: Fast, efficient, strict (prevents phantom dependencies)
  - **Alternative**: npm (built-in) or yarn

#### Electron Integration (Optional for Desktop App)

**Desktop Distribution**
- **Electron**: ^28.2.0 (Latest stable)
  - **Status**: Very active, maintained by OpenJS Foundation
  - **Why**: Cross-platform desktop apps with web technologies
  - **GitHub**: electron/electron
- **electron-builder**: ^24.9.1
  - **Status**: Active, standard for Electron packaging
  - **Why**: Build installers for macOS/Windows/Linux

**Note**: For MVP, web-only deployment is simpler. Electron can be added post-MVP for easier installation.

### Dependencies Summary Table

| Category | Package | Version | Status | GitHub Stars | Last Updated |
|----------|---------|---------|--------|--------------|--------------|
| **Runtime** | Node.js | 20.x LTS | Active | N/A | 2024 |
| **Language** | TypeScript | ^5.3.3 | Active | 98k+ | Jan 2024 |
| **Backend Framework** | Fastify | ^4.26.0 | Very Active | 30k+ | Jan 2024 |
| **Image Processing** | Sharp | ^0.33.2 | Very Active | 28k+ | Jan 2024 |
| **Computer Vision** | opencv4nodejs | ^6.1.0 | Active | 4.4k+ | 2024 |
| **OCR** | tesseract.js | ^5.0.4 | Very Active | 33k+ | 2024 |
| **Database** | better-sqlite3 | ^9.3.0 | Very Active | 5.2k+ | Jan 2024 |
| **ORM** | drizzle-orm | ^0.29.3 | Very Active | 19k+ | Jan 2024 |
| **Scanner Protocol** | ipp | ^2.0.1 | Active | 300+ | 2023 |
| **mDNS Discovery** | bonjour-service | ^1.2.0 | Active | 200+ | 2024 |
| **Frontend** | React | ^18.2.0 | Very Active | 220k+ | 2024 |
| **Build Tool** | Vite | ^5.0.12 | Very Active | 65k+ | Jan 2024 |
| **Styling** | Tailwind CSS | ^3.4.1 | Very Active | 78k+ | Jan 2024 |
| **State** | Zustand | ^4.5.0 | Very Active | 43k+ | Jan 2024 |
| **Real-time** | socket.io | ^4.7.0 | Very Active | 60k+ | 2024 |
| **Testing** | Vitest | ^1.2.0 | Very Active | 11k+ | Jan 2024 |
| **E2E Testing** | Playwright | ^1.41.0 | Very Active | 61k+ | Jan 2024 |

**All dependencies verified as:**
- Actively maintained (commits within last 3 months)
- Major version stable (no breaking changes expected)
- Strong TypeScript support
- Good documentation and community

### Scanner Communication Strategy

**Primary Method: eSCL (AirPrint Scanning)**
- Epson ET-3750 supports eSCL protocol (driverless scanning)
- HTTP-based protocol, works across platforms
- No vendor drivers required
- Implementation: Use `ipp` package to send HTTP requests

**eSCL Workflow**:
1. Discover scanner via mDNS/Bonjour (`bonjour-service` package)
2. Query scanner capabilities: `GET /eSCL/ScannerCapabilities`
3. Create scan job: `POST /eSCL/ScanJobs` with XML settings
4. Poll job status: `GET /eSCL/ScanJobs/{jobId}`
5. Download scan: `GET /eSCL/ScanJobs/{jobId}/NextDocument`

**TypeScript Implementation**:
```typescript
import ipp from 'ipp';
import Bonjour from 'bonjour-service';

// Scanner discovery
const bonjour = new Bonjour();
const browser = bonjour.find({ type: 'uscan' });

browser.on('up', (service) => {
  console.log('Found scanner:', service.name, service.addresses);
});

// eSCL scan request
const scanSettings = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03">
  <pwg:Version>2.0</pwg:Version>
  <scan:Intent>Photo</scan:Intent>
  <scan:DocumentFormat>image/jpeg</scan:DocumentFormat>
  <scan:XResolution>300</scan:XResolution>
  <scan:YResolution>300</scan:YResolution>
  <scan:ColorMode>RGB24</scan:ColorMode>
</scan:ScanSettings>`;
```

**Fallback Method: SANE (Scanner Access Now Easy)**
- Cross-platform scanner backend
- Requires installation of SANE libraries and Epson backend
- Use `node-sane` package (TypeScript bindings available)
- Command-line fallback: spawn `scanimage` utility

**Platform-Specific Notes**:
- **macOS**: eSCL works natively, SANE via Homebrew (`brew install sane-backends`)
- **Linux**: SANE native, eSCL via `ipp-usb` or `sane-airscan`
- **Windows**: eSCL via WIA, SANE via Windows port (more complex)

### Integration Points

#### Scanner Integration (eSCL Protocol)

**Discovery**:
```typescript
import Bonjour from 'bonjour-service';

interface ScannerService {
  name: string;
  host: string;
  port: number;
  addresses: string[];
}

const discoverScanners = async (): Promise<ScannerService[]> => {
  const bonjour = new Bonjour();
  const scanners: ScannerService[] = [];

  return new Promise((resolve) => {
    const browser = bonjour.find({ type: 'uscan' });

    browser.on('up', (service) => {
      scanners.push({
        name: service.name,
        host: service.host,
        port: service.port || 80,
        addresses: service.addresses
      });
    });

    setTimeout(() => {
      browser.stop();
      resolve(scanners);
    }, 3000); // 3 second discovery window
  });
};
```

**Scanning**:
```typescript
interface ScanOptions {
  resolution: 300 | 600;
  colorMode: 'RGB24' | 'Grayscale8';
  format: 'image/jpeg' | 'image/png';
}

const initiateScan = async (
  scannerUrl: string,
  options: ScanOptions
): Promise<string> => {
  const scanSettings = buildScanSettingsXML(options);

  const response = await fetch(`${scannerUrl}/eSCL/ScanJobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
    },
    body: scanSettings,
  });

  const location = response.headers.get('Location');
  if (!location) throw new Error('No scan job location returned');

  return location; // Job URL for polling
};
```

#### File System Integration

**Output Directory Structure**:
```
~/PhotoScan/
├── config/
│   └── settings.json          # User preferences
├── originals/                  # Unprocessed raw scans
│   ├── 2024-12-05_001_front_raw.jpg
│   └── 2024-12-05_001_back_raw.jpg
├── processed/                  # Enhanced photos organized by date
│   ├── 1985/
│   │   ├── 06/
│   │   │   ├── 1985-06-15_001_front.jpg
│   │   │   ├── 1985-06-15_001_back.jpg
│   │   │   └── 1985-06-15_001.json
│   │   └── 12/
│   └── unknown/                # Photos without extractable dates
│       ├── unknown_001_front.jpg
│       └── unknown_001.json
├── logs/
│   └── photoscan.log
└── photoscan.db                # SQLite database
```

**TypeScript Path Utilities**:
```typescript
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

const PHOTOSCAN_ROOT = join(homedir(), 'PhotoScan');

export const paths = {
  root: PHOTOSCAN_ROOT,
  originals: join(PHOTOSCAN_ROOT, 'originals'),
  processed: join(PHOTOSCAN_ROOT, 'processed'),
  config: join(PHOTOSCAN_ROOT, 'config'),
  logs: join(PHOTOSCAN_ROOT, 'logs'),
  database: join(PHOTOSCAN_ROOT, 'photoscan.db'),
};

export const ensureDirectories = async () => {
  for (const path of Object.values(paths)) {
    if (path.endsWith('.db')) continue; // Skip database file
    await mkdir(path, { recursive: true });
  }
};
```

#### Database Schema (Drizzle ORM)

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frontFilePath: text('front_file_path').notNull(),
  backFilePath: text('back_file_path'),
  originalFrontPath: text('original_front_path').notNull(),
  originalBackPath: text('original_back_path'),
  scanDate: text('scan_date').default(sql`CURRENT_TIMESTAMP`),
  photoDate: text('photo_date'), // Extracted from OCR
  extractedText: text('extracted_text'), // Full OCR text
  metadataJson: text('metadata_json'), // Additional metadata as JSON
  processingStatus: text('processing_status'), // pending, processed, failed
  confidenceScore: real('confidence_score'), // OCR/detection confidence 0-1
});

export const scanSessions = sqliteTable('scan_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startTime: text('start_time').default(sql`CURRENT_TIMESTAMP`),
  endTime: text('end_time'),
  photosScanned: integer('photos_scanned').default(0),
  status: text('status'), // active, completed, aborted
});

// Type inference for TypeScript
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type ScanSession = typeof scanSessions.$inferSelect;
```

**Database Operations**:
```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { photos, NewPhoto } from './schema';

const sqlite = new Database(paths.database);
const db = drizzle(sqlite);

// Insert photo
const insertPhoto = (photo: NewPhoto) => {
  return db.insert(photos).values(photo).returning();
};

// Query photos
const getPhotos = () => {
  return db.select().from(photos).all();
};
```

## Success Metrics

### Key Performance Indicators (KPIs)

#### Efficiency Metrics
- **KPI-1.1**: Throughput - Photos scanned per hour
  - **Target**: 100+ photos/hour (4 photos every ~2.5 minutes)
  - **Measurement**: Track completion timestamps in database
  - **Baseline**: Manual single-photo scanning: ~20 photos/hour
- **KPI-1.2**: Cycle time - Average time per 4-photo batch
  - **Target**: ≤60 seconds (scan + process + save)
  - **Measurement**: Timer from scan start to save completion
- **KPI-1.3**: User interaction time - Time user spends per batch
  - **Target**: <15 seconds (place photos, tap scan, flip, tap scan, remove)
  - **Measurement**: User surveys and workflow observation

#### Quality Metrics
- **KPI-2.1**: Photo detection accuracy
  - **Target**: 95%+ correct detection (4/4 photos detected)
  - **Measurement**: Log detection failures, user feedback
  - **Data Source**: Application logs, error tracking
- **KPI-2.2**: Front/back pairing accuracy
  - **Target**: 90%+ correct automatic pairing
  - **Measurement**: User manual override rate
  - **Data Source**: Pairing correction events in database
- **KPI-2.3**: OCR extraction success rate
  - **Target**: 70%+ dates successfully extracted
  - **Measurement**: Percentage of photos with parsed dates
  - **Data Source**: Photos table, date field population rate

#### Usability Metrics
- **KPI-3.1**: First-scan success rate
  - **Target**: 80%+ of users complete first scan without help
  - **Measurement**: Analytics tracking, user surveys
- **KPI-3.2**: Error rate
  - **Target**: <5% of scans result in errors requiring intervention
  - **Measurement**: Error log analysis
  - **Data Source**: Application error logs
- **KPI-3.3**: Mobile usability score
  - **Target**: 4.0+ out of 5.0 rating for mobile interface
  - **Measurement**: Post-session user surveys

### Measurement Methodology and Data Sources

#### Instrumentation
- **Event Tracking**: Log all key events with timestamps using Pino logger
  - Scan start/complete
  - Processing start/complete
  - Photo detection results (count, confidence)
  - Pairing events (auto vs manual)
  - Error occurrences
- **Performance Monitoring**: Track execution times
  - Scanner communication latency
  - Image processing duration
  - OCR processing duration
  - Database write times
- **User Analytics**: Capture usage patterns
  - Session duration
  - Photos per session
  - Feature usage (settings changes, manual overrides)

#### Data Collection
- **Database**: SQLite tables for structured data
  - Photos table: Detection and pairing outcomes
  - Sessions table: Throughput and timing data
  - Events table: Detailed event log with timestamps
- **Log Files**: Structured JSON logs via Pino for troubleshooting
- **User Surveys**: Post-session feedback form
  - Satisfaction rating (1-5)
  - Open feedback text
  - Feature requests

### Success Criteria and Thresholds

#### MVP Success Criteria
- **Must Achieve**:
  - 100+ photos scanned per hour throughput
  - 95%+ photo detection accuracy
  - <5% error rate requiring user intervention
  - 4.0+ usability rating from test users
- **Should Achieve**:
  - 90%+ front/back pairing accuracy
  - 70%+ OCR date extraction success
  - <60 second cycle time per batch
- **Nice to Have**:
  - 80%+ color restoration satisfaction rating
  - 50%+ of users enable high-quality (600 DPI) mode

#### Quality Metrics

**Performance**:
- **Response time**: 95th percentile scan-to-preview < 20 seconds
- **Uptime**: 99%+ during scanning sessions
- **Resource usage**: <50% CPU average, <2GB RAM

**Reliability**:
- **Error recovery**: 100% of errors have clear user-actionable messages
- **Data integrity**: 0% photo loss (all scans saved even if processing fails)
- **Crash rate**: <0.1% of scan operations

**Usability**:
- **Mobile responsiveness**: <100ms touch response time
- **Accessibility**: WCAG 2.1 AA compliance
- **Learning curve**: 80%+ first-time users successful within 5 minutes

#### Business Metrics

**Adoption**:
- **User retention**: 70%+ of users complete second scanning session
- **Session size**: Average 50+ photos per session
- **Completion rate**: 60%+ of started collections fully digitized

**Engagement**:
- **Weekly active users**: Track for multi-user deployments
- **Feature usage**: 30%+ users adjust settings/preferences
- **Recommendation**: 80%+ Net Promoter Score (NPS)

#### Technical Metrics

**Code Quality**:
- **Test coverage**: 80%+ code coverage for core scanning logic
- **Performance tests**: All API endpoints < 2 second response time
- **Error handling**: 100% of user-facing functions have try/catch

**Operational**:
- **Error rates**: <1% of scan operations fail
- **Response times**: 90th percentile API response < 500ms
- **Uptime**: 99.9% application availability during active hours

## Out of Scope

### Explicitly Excluded Features

#### MVP Exclusions (Future Enhancements)
1. **Advanced AI Restoration**:
   - Deep learning scratch removal
   - AI-powered colorization of black & white photos
   - Face detection and recognition
   - Automatic photo categorization by content
   - *Rationale*: Complex, requires significant compute resources, can be added post-MVP

2. **Multi-User Features**:
   - User accounts and authentication
   - Role-based access control
   - Concurrent scanning sessions
   - Collaboration features (shared collections)
   - *Rationale*: MVP targets single-user household use case

3. **Cloud Integration**:
   - Cloud backup (Google Photos, Dropbox, etc.)
   - Cloud-based AI processing
   - Remote access to scanned photos
   - *Rationale*: Privacy-first approach, local-only for MVP

4. **Advanced Organization**:
   - Facial recognition tagging
   - Automated event detection (birthdays, holidays)
   - Smart albums and collections
   - Photo story generation
   - *Rationale*: Complex features, not core to scanning workflow

5. **Export Options**:
   - Photo book generation
   - Slideshow creation
   - Video compilation
   - Social media sharing
   - *Rationale*: Post-processing features outside core scanning scope

6. **Hardware Features**:
   - Automatic document feeder (ADF) support
   - Multiple scanner support
   - USB-connected scanner support
   - *Rationale*: MVP focused on specific hardware (Epson ET-3750 flatbed)

#### Permanent Exclusions
1. **Mobile Scanning**: Using phone camera instead of scanner
   - *Rationale*: Different problem domain, quality concerns
2. **Video Digitization**: Scanning video tapes or film
   - *Rationale*: Requires completely different hardware/workflow
3. **Professional Features**: CMYK color space, ICC profiles, commercial printing
   - *Rationale*: Consumer-focused application, not for professional archivists

### Future Considerations (Post-MVP Roadmap)

#### Phase 2: Enhanced Processing (3-6 months post-MVP)
- Advanced AI restoration using pre-trained models
- Scratch and damage removal
- Color restoration for severely faded photos
- Configurable processing presets (light/medium/heavy enhancement)

#### Phase 3: Organization & Metadata (6-9 months post-MVP)
- Name extraction and face recognition
- Event detection and smart grouping
- Advanced search by date, people, keywords
- Timeline visualization

#### Phase 4: Sharing & Export (9-12 months post-MVP)
- Cloud backup integration (optional)
- Photo book PDF generation
- Export to common formats (Google Photos, Apple Photos)
- Sharing links for family members

#### Phase 5: Extended Hardware Support (12+ months post-MVP)
- ADF (Automatic Document Feeder) batch scanning
- Support for multiple scanner models
- USB scanner support
- Multi-scanner environments

## Timeline & Resources

### Development Phases

#### Phase 0: Research & Prototyping (2 weeks)
**Objectives**:
- Validate eSCL communication with Epson ET-3750
- Prototype photo detection algorithm with sample scans
- Verify all dependencies work together
- Create basic scanner discovery proof-of-concept

**Deliverables**:
- Working scanner communication demo (TypeScript)
- Photo detection accuracy report (test with 20+ sample scans)
- Verified technology stack (all dependencies installed and working)
- Updated project timeline based on findings

**Team**: 1 engineer

**Key Tasks**:
- Set up TypeScript project with Fastify + Vite
- Test `ipp` package with Epson ET-3750
- Test `sharp` image processing pipeline
- Test `tesseract.js` OCR accuracy
- Validate `opencv4nodejs` installation and photo detection

#### Phase 1: Core Scanning Infrastructure (4 weeks)
**Objectives**:
- Implement scanner discovery and communication
- Build scan initiation and status tracking
- Create basic photo detection and cropping
- Set up project structure and build system

**Deliverables**:
- Functional scanner integration (eSCL + fallback to SANE)
- Photo detection with 90%+ accuracy
- File saving and basic organization
- Unit tests for core functions (Vitest)

**Team**: 1-2 engineers

**Success Criteria**:
- Can scan 4 photos and save as separate files
- Scanner discovery works on macOS (primary platform)
- Detection handles various photo orientations
- All core modules have TypeScript types

#### Phase 2: Web Interface & Real-Time Feedback (3 weeks)
**Objectives**:
- Build responsive web UI with React + TypeScript
- Implement real-time status updates via Socket.IO
- Create mobile-optimized scanning workflow
- Add preview thumbnail generation

**Deliverables**:
- Mobile-friendly web interface (Tailwind CSS + Radix UI)
- Real-time progress indicators
- Preview thumbnails after scanning
- Session statistics dashboard

**Team**: 1 frontend engineer, 1 backend engineer

**Success Criteria**:
- Web UI loads in <1 second on local network
- Touch targets meet 44x44pt minimum
- Real-time updates work reliably
- TypeScript coverage 100% for frontend

#### Phase 3: Front/Back Pairing & Processing Pipeline (3 weeks)
**Objectives**:
- Implement position-based front/back pairing
- Build image enhancement pipeline (Sharp.js)
- Add OCR for photo backs (Tesseract.js)
- Create metadata extraction logic (date parsing with chrono-node)

**Deliverables**:
- Automatic front/back pairing with visual guide
- Basic image enhancement (crop, rotate, white balance via Sharp)
- OCR with date extraction
- Metadata storage in EXIF (via exifreader) and JSON

**Team**: 1-2 engineers

**Success Criteria**:
- 90%+ pairing accuracy in testing
- Date extraction works for common formats
- Image quality improvements visible in A/B tests
- All processing modules fully typed

#### Phase 4: Testing, Polish & Documentation (2 weeks)
**Objectives**:
- End-to-end testing on all platforms
- User acceptance testing with target personas
- Performance optimization
- Documentation and setup guides

**Deliverables**:
- Comprehensive test suite (Vitest + Playwright, 80%+ coverage)
- User manual and quick start guide
- Installation scripts for all platforms
- Performance benchmarks report

**Team**: 1 engineer, 2-3 beta testers

**Success Criteria**:
- All acceptance criteria met for P0 user stories
- Installation works on clean macOS, Linux, Windows systems
- UAT participants rate usability 4.0+/5.0
- TypeScript strict mode enabled, zero `any` types

#### Phase 5: MVP Release (1 week)
**Objectives**:
- Package application for distribution
- Create release documentation
- Set up issue tracking and support
- Plan Phase 2 features based on feedback

**Deliverables**:
- Packaged application for all platforms (or web-only for MVP)
- Release notes and changelog
- Support documentation and FAQ
- Post-MVP roadmap

**Team**: 1 engineer

### Resource Requirements

#### Team Composition
- **Minimum (MVP)**: 1 full-stack TypeScript engineer (14 weeks)
- **Optimal**: 2 engineers (1 backend/infra, 1 frontend/UX) (10-12 weeks)
- **Beta Testers**: 3-5 users matching target personas

#### Infrastructure
- **Development**:
  - Epson ET-3750 scanner for testing (hardware requirement)
  - Network setup (router with mDNS support)
  - Test devices: macOS laptop, Linux desktop, Windows VM, iOS/Android devices
- **Deployment**: Self-hosted on user's local machine (no cloud infrastructure)

#### External Dependencies
- All dependencies are open-source (MIT/Apache licenses)
- System dependencies: Node.js 20.x, OpenCV libraries (optional)

### Risk Assessment

#### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| eSCL protocol incompatibility with Epson ET-3750 | Medium | High | Phase 0 validation; SANE fallback; early hardware testing |
| OpenCV installation issues on Windows | Medium | Medium | Provide pre-built binaries; alternative: opencv-js (WebAssembly) |
| Photo detection accuracy below 90% | Medium | High | Algorithm iteration in Phase 0; user feedback loop; manual correction UI |
| Front/back pairing failures frustrate users | Medium | Medium | Clear visual guides; fallback to manual pairing; user testing |
| Image processing too slow for good UX | Low | Medium | Performance profiling; optimize Sharp.js pipeline; background processing |
| Cross-platform scanner issues | Medium | High | Test on all platforms early; platform-specific fallbacks |
| OCR accuracy low for handwritten text | High | Low | Set expectations; focus on printed text first; manual editing option |
| TypeScript build complexity | Low | Low | Use tsup for backend, Vite for frontend (proven tooling) |

#### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| User network configuration issues | Medium | Medium | Auto-discovery with manual IP fallback; clear troubleshooting docs |
| Storage space exhaustion during large scans | Low | Medium | Disk space check before scan; warnings at 80% capacity |
| Scanner busy/offline errors | Medium | Low | Clear error messages; retry logic; scanner status indicator |
| Users lose track of photo positions | Medium | Medium | Numbered position overlay; audio cues; simple workflow |
| Dependency updates break build | Low | High | Pin exact versions; test updates in CI; use pnpm lockfile |

#### User Adoption Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Workflow too complex for non-technical users | Low | High | Extensive usability testing; simplified UI; onboarding tutorial |
| Users expect cloud backup/sharing | Medium | Low | Clear communication about local-only approach; future roadmap visibility |
| Installation too difficult (Node.js requirement) | Medium | Medium | Consider Electron packaging post-MVP; provide clear installation guide |
| Competition from existing scanning solutions | Low | Medium | Focus on unique batch+backs workflow; superior UX |

### Assumptions and Dependencies

#### Key Assumptions
1. **Hardware**: Users have Epson ET-3750 or compatible eSCL scanner
2. **Network**: Scanner and computer on same local network with mDNS
3. **Photos**: Standard print sizes (3x5", 4x6", 5x7"), placed flat on scanner
4. **User Behavior**: Users willing to spend 1-2 hour sessions scanning
5. **Technical Skill**: Users comfortable installing Node.js applications
6. **Storage**: Users have adequate disk space (50GB+ for large collections)

#### External Dependencies
- **Scanner Availability**: Epson ET-3750 available for testing
- **Open Source Libraries**: All packages actively maintained
- **Platform Support**: mDNS/Bonjour available on target OSes
- **Node.js Runtime**: Node.js 20.x LTS available for all platforms
- **No Internet Required**: All features work offline (except initial npm install)

### Go/No-Go Criteria

#### Prerequisites for MVP Launch
- [ ] Scanner communication works reliably on macOS, Linux, Windows
- [ ] Photo detection accuracy ≥95% on test dataset (100+ scans)
- [ ] Front/back pairing accuracy ≥90% on test dataset
- [ ] Web UI usability rating ≥4.0/5.0 from beta testers
- [ ] No critical bugs or data loss issues
- [ ] All P0 user stories have passing acceptance criteria
- [ ] Documentation complete (installation, quick start, troubleshooting)
- [ ] Performance targets met (≤60s cycle time, ≤20s preview)
- [ ] TypeScript strict mode enabled, 100% typed codebase
- [ ] Test coverage ≥80% for core modules

#### Success Indicators Post-Launch
- [ ] 70%+ of users complete second scanning session (retention)
- [ ] 80%+ of users successfully scan 50+ photos in first week
- [ ] <10% support requests per active user
- [ ] Net Promoter Score (NPS) ≥40

## Integration Considerations

### CI/CD Pipeline Requirements

#### Continuous Integration
- **Build Automation**: GitHub Actions for automated builds
  - Matrix builds for Node.js 20.x on macOS, Linux, Windows
  - Run unit tests (Vitest) and integration tests
  - TypeScript type checking (`tsc --noEmit`)
- **Test Coverage**: Enforce 80%+ coverage for core modules
  - Scanner communication layer
  - Photo detection algorithm
  - Image processing pipeline
  - API endpoints
- **Linting & Formatting**: Automated code quality checks
  - ESLint with @typescript-eslint plugin
  - Prettier formatting
  - Pre-commit hooks via Husky + lint-staged

**Example GitHub Actions Workflow**:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm run type-check
      - run: pnpm run lint
      - run: pnpm run test
      - run: pnpm run build
```

#### Continuous Delivery
- **Packaging**: Automated packaging for distribution
  - Web app: Static build output (Vite)
  - Optional Electron: electron-builder for installers
- **Versioning**: Semantic versioning (MAJOR.MINOR.PATCH)
  - Auto-increment based on conventional commits
  - Use `standard-version` or `release-it` packages
- **Release Notes**: Auto-generated from commit messages
- **Artifact Storage**: GitHub Releases

### Deployment Strategy

#### Installation Methods

**Web Application (MVP)**:
- **Prerequisites**: Node.js 20.x installed
- **Installation**:
  ```bash
  npx photoscan@latest
  # Or
  pnpm create photoscan
  ```
- **First-Run**: Opens browser to http://localhost:3000

**Desktop Application (Post-MVP)**:
- **macOS**: `.dmg` installer
- **Linux**: `.AppImage` or `.deb`/`.rpm` packages
- **Windows**: `.exe` installer

#### First-Run Setup
- **Scanner Discovery**: Auto-discover scanner on launch
- **Output Directory**: Prompt for photo storage location
- **Quick Tutorial**: 30-second interactive walkthrough
- **Settings**: Pre-configured defaults (300 DPI, JPEG quality 92%)

#### Upgrade Path
- **Auto-Update Check**: Check npm registry for updates
- **In-Place Upgrade**: `pnpm update photoscan`
- **Migration**: Automatic database schema migrations via Drizzle Kit
- **Rollback**: `pnpm install photoscan@<version>`

### Monitoring and Alerting Needs

#### Application Monitoring
- **Error Tracking**: Capture and log all errors via Pino
  - Structured JSON logs
  - Error frequency and patterns
  - Stack traces for debugging
- **Performance Monitoring**: Track key performance metrics
  - Scan cycle time distribution
  - Photo detection accuracy over time
  - Memory and CPU usage patterns
- **Usage Analytics** (Privacy-Preserving):
  - Feature usage counts (no PII)
  - Session statistics (duration, photo count)
  - Error rates and types

#### Logging Strategy
- **Structured Logging**: Pino with JSON output
  - Timestamp, log level, module, message, context
- **Log Rotation**: Prevent disk space exhaustion
  - Daily rotation with 30-day retention via `pino-roll`
  - Compress old logs
- **Log Levels**:
  - ERROR: Critical issues requiring attention
  - WARN: Potential issues or degraded operation
  - INFO: Normal operation events (scan start/complete)
  - DEBUG: Detailed troubleshooting information (disabled by default)

**Example Logging**:
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

logger.info({ scanId: '123', photos: 4 }, 'Scan completed');
logger.error({ err: error, scanId: '123' }, 'Scanner communication failed');
```

#### Health Checks
- **Scanner Connectivity**: Periodic ping to scanner
  - Alert if scanner offline >5 minutes during active session
- **Disk Space**: Monitor available storage
  - Warn at 20% free space
  - Block scans at 10% free space
- **Process Health**: Ensure background workers running

#### User-Facing Status
- **System Status Page**: Simple UI showing health
  - Scanner status (online/offline)
  - Disk space available
  - Recent errors (last 24 hours)
- **Troubleshooting**: Built-in diagnostics
  - "Run diagnostics" button generates report
  - Export logs for support requests

### Documentation Requirements

#### User Documentation
- **Quick Start Guide**: Single-page getting started
  - Installation steps (Node.js + pnpm)
  - First scan walkthrough
  - Common troubleshooting
- **User Manual**: Comprehensive guide (Markdown)
  - Complete feature documentation
  - Advanced settings explained
  - Best practices for photo placement
  - FAQ section
- **API Documentation**: TypeDoc-generated API reference

#### Technical Documentation
- **API Reference**: Document all REST endpoints (OpenAPI/Swagger)
  - Request/response formats
  - Error codes and meanings
- **Architecture Documentation**: System design overview
  - Component diagram
  - Data flow diagrams
  - Technology stack rationale
- **Development Guide**: For contributors
  - Local development setup
  - Coding standards (TypeScript strict mode)
  - Testing guidelines
  - How to add new scanner support

#### Operations Documentation
- **Installation Guide**: Platform-specific setup
  - Prerequisites (Node.js, system libraries)
  - Installation steps
  - Configuration options
  - Troubleshooting installation issues
- **Upgrade Guide**: How to update safely
  - Backup recommendations
  - Upgrade process
  - Post-upgrade verification
- **Support Guide**: For helping users
  - Common issues and solutions
  - How to collect diagnostics
  - Escalation procedures

## Appendices

### Glossary

- **eSCL**: eScan Language - HTTP-based scanning protocol developed by Apple (AirPrint Scan)
- **SANE**: Scanner Access Now Easy - cross-platform scanner API
- **Flatbed Scanner**: Scanner with glass plate for scanning documents/photos
- **DPI**: Dots Per Inch - scan resolution measurement
- **OCR**: Optical Character Recognition - text extraction from images
- **Deskew**: Automatic rotation correction to straighten scanned images
- **mDNS**: Multicast DNS - zero-configuration networking protocol (Bonjour)
- **Contour**: Outline or boundary detected in image processing
- **Sidecar File**: Metadata file stored alongside image (e.g., `.json` or `.xmp`)
- **EXIF**: Exchangeable Image File Format - metadata standard for images
- **IPTC**: International Press Telecommunications Council - metadata standard
- **WebSocket**: Protocol for real-time bidirectional communication
- **IPP**: Internet Printing Protocol - extends to scanning via eSCL
- **TypeScript**: Typed superset of JavaScript for safer code
- **Fastify**: Fast, low-overhead Node.js web framework
- **Sharp**: High-performance image processing library (libvips)
- **Drizzle ORM**: TypeScript-first ORM for SQL databases
- **Vitest**: Vite-native unit testing framework
- **Playwright**: Cross-browser end-to-end testing framework
- **pnpm**: Fast, space-efficient package manager

### References

**Scanner Protocol Documentation**:
- eSCL Specification: [PWG 5108.5 - IPP Scan Service](https://ftp.pwg.org/pub/pwg/candidates/cs-ipscan10-20140918-5108.5.pdf)
- SANE Documentation: [sane-project.org](http://www.sane-project.org/)
- IPP Everywhere: [PWG 5100.14](https://ftp.pwg.org/pub/pwg/candidates/cs-ippeve10-20130128-5100.14.pdf)

**Image Processing**:
- Sharp Documentation: [sharp.pixelplumbing.com](https://sharp.pixelplumbing.com/)
- OpenCV.js: [docs.opencv.org/4.x/d5/d10/tutorial_js_root.html](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- Tesseract.js: [github.com/naptha/tesseract.js](https://github.com/naptha/tesseract.js)

**TypeScript & Node.js**:
- TypeScript Handbook: [typescriptlang.org/docs](https://www.typescriptlang.org/docs/)
- Node.js Documentation: [nodejs.org/docs](https://nodejs.org/docs/)
- Fastify Documentation: [fastify.dev](https://fastify.dev/)
- Drizzle ORM: [orm.drizzle.team](https://orm.drizzle.team/)

**Standards**:
- EXIF 2.32 Specification: [CIPA Standards](https://www.cipa.jp/std/documents/e/DC-008-Translation-2019-E.pdf)
- IPTC Photo Metadata: [iptc.org/standards/photo-metadata](https://iptc.org/standards/photo-metadata/)
- WCAG 2.1 Accessibility: [w3.org/WAI/WCAG21](https://www.w3.org/WAI/WCAG21/quickref/)

### Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-05 | Product Team | Initial PRD for PhotoScan MVP |
| 1.1 | 2024-12-05 | Product Team | Updated to full TypeScript stack with verified dependency versions |

---

## Approval Sign-Off

This PRD requires approval from the following stakeholders before implementation begins:

- [ ] **Product Owner**: Approved scope, priorities, and success metrics
- [ ] **Engineering Lead**: Confirmed technical feasibility and timeline
- [ ] **User Representative**: Validated user stories and acceptance criteria
- [ ] **Project Sponsor**: Approved resource allocation and timeline

**Approval Date**: _________________

**Implementation Start Date**: _________________

---

*This PRD is a living document. Changes during implementation should be tracked in the Change Log section and require stakeholder approval for scope changes.*
