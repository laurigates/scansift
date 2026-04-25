---
id: PRD-001
title: ScanSift Product Requirements
status: Accepted
date: 2026-03-05
last_reviewed: 2026-04-25
source: docs/prds/photoscan-mvp-longform.md
---

# PRD-001: ScanSift

> **Note:** This PRD has been reconciled against the implementation as of
> 2026-04-25. Items not yet built are kept for roadmap visibility but marked
> with a Status column and called out in the "Known Drift / Implementation
> Notes" section near the bottom. Status legend:
>
> - ✅ Implemented
> - ⚠️ Partial — see notes
> - ❌ Not implemented (roadmap)

## Problem Statement

Digitizing physical photo collections with a flatbed scanner is slow and inefficient. Users must
scan one photo at a time, move between scanner and computer repeatedly, and manually capture
metadata (dates, names) written on photo backs. The result is low throughput, broken workflow,
and lost historical context.

## Solution

ScanSift is a local-network web application that turns a single flatbed scan into up to four
individually cropped and enhanced photos. Users control scanning from a mobile device while
standing at the scanner. Photo backs are scanned in a second pass, automatically paired with
fronts by grid position, and OCR-processed to extract date metadata.

## User Personas

| Persona | Context | Key Need |
|---------|---------|----------|
| Family Historian | 2000+ inherited photos | Preserve backs, organize by date, 1-hour sessions |
| Efficiency Optimizer | Personal archive | Minimal intervention, batch automation |

## User Stories (MVP scope)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-1.1 | Scan 4 photos at once on flatbed | P0 | ✅ Implemented |
| US-1.2 | Trigger scan from mobile phone | P0 | ✅ Implemented |
| US-1.3 | Scan fronts then backs, auto-pair by position | P0 | ⚠️ Partial — pairs by exact grid position only (see FR-3.2) |
| US-1.4 | Real-time progress feedback with thumbnails | P0 | ✅ Implemented |
| US-2.1 | Auto-crop and deskew detected photos | P0 | ⚠️ Partial — auto-crop works, deskew not implemented (see FR-5.2) |
| US-2.2 | Automatic contrast / white-balance enhancement | P1 | ✅ Implemented |
| US-3.1 | OCR date extraction from photo backs | P1 | ❌ Not implemented |
| US-3.3 | Date-based folder organization, sidecar JSON | P1 | ❌ Not implemented |

## Scan Workflow State Machine

```
IDLE
  -> SCANNING_FRONTS  (user taps Scan Fronts)
  -> PROCESSING_FRONTS
  -> READY_FOR_BACKS  (prompt: flip photos)
  -> SCANNING_BACKS   (user taps Scan Backs)
  -> PROCESSING_BACKS
  -> SAVING
  -> COMPLETE -> IDLE

Any stage -> ERROR -> retry or skip
```

## Functional Requirements

### FR-1: Network Scanner Integration

| ID | Requirement | Status |
|----|-------------|--------|
| FR-1.1 | Discover eSCL-compatible scanners on local network via mDNS (`_uscan._tcp`) | ✅ Implemented |
| FR-1.2 | Communicate with scanner using eSCL/AirPrint protocol (HTTP + XML) | ✅ Implemented |
| FR-1.3 | Support 300 DPI (default) and 600 DPI (high quality) | ✅ Implemented |
| FR-1.4 | Report scanner status: ready / busy / error / offline | ✅ Implemented |

### FR-2: Photo Detection

| ID | Requirement | Status |
|----|-------------|--------|
| FR-2.1 | Detect 1-4 photos per flatbed scan | ✅ Implemented |
| FR-2.2 | Use Canny edge detection + contour analysis (OpenCV.js) | ✅ Implemented |
| FR-2.3 | Handle portrait and landscape orientations, rotation up to 45 deg | ✅ Implemented |
| FR-2.4 | Assign grid positions (top-left, top-right, bottom-left, bottom-right) | ✅ Implemented |
| FR-2.5 | Output per-photo confidence score | ✅ Implemented |

### FR-3: Front/Back Pairing

| ID | Requirement | Status |
|----|-------------|--------|
| FR-3.1 | Match fronts to backs by grid position | ✅ Implemented |
| FR-3.2 | Tolerate position deviation up to 10% | ❌ Not implemented — exact grid-position match only |
| FR-3.3 | Gracefully handle missing backs (save front-only) | ✅ Implemented |

### FR-4: Web Interface

| ID | Requirement | Status |
|----|-------------|--------|
| FR-4.1 | Responsive UI accessible from mobile (iOS 14+ Safari, Android Chrome 90+) | ✅ Implemented |
| FR-4.2 | Touch targets minimum 44x44pt | ✅ Implemented |
| FR-4.3 | Real-time progress via Socket.IO | ✅ Implemented |
| FR-4.4 | Thumbnail preview grid (2x2) after detection | ✅ Implemented |
| FR-4.5 | Works fully offline on local network | ✅ Implemented |

### FR-5: Image Processing Pipeline

| ID | Requirement | Status |
|----|-------------|--------|
| FR-5.1 | Crop to detected bounds with 2% margin (Sharp) | ⚠️ Partial — crops to detected bounds; 2% margin not applied |
| FR-5.2 | Deskew rotation correction | ❌ Not implemented — manual rotation supported in `enhancer.ts`, no auto-deskew |
| FR-5.3 | Auto white-balance and contrast normalization | ✅ Implemented |
| FR-5.4 | Save as JPEG (quality 95%) with optional PNG archival | ⚠️ Partial — JPEG only; no PNG archival path |
| FR-5.5 | Preserve original unprocessed scan in `originals/` | ⚠️ Partial — preserved under `raw/` (path drift), not `originals/` |

### FR-6: OCR and Metadata

| ID | Requirement | Status |
|----|-------------|--------|
| FR-6.1 | OCR photo backs with Tesseract.js | ❌ Not implemented |
| FR-6.2 | Parse date patterns (MM/DD/YYYY, Month Year, etc.) | ❌ Not implemented |
| FR-6.3 | Write extracted date to EXIF tags and sidecar JSON | ❌ Not implemented |
| FR-6.4 | Preserve all extracted text even when no date is found | ❌ Not implemented |

### FR-7: File Organization

| ID | Requirement | Status |
|----|-------------|--------|
| FR-7.1 | Output structure: `processed/YYYY/MM/YYYY-MM-DD_NNN_front.jpg` | ❌ Not implemented — current output is flat `{batchId}/photo-NNN-{position}-{front\|back}.jpg` |
| FR-7.2 | Undated photos land in `processed/unknown/` | ❌ Not implemented |
| FR-7.3 | Sidecar JSON per photo with all metadata | ❌ Not implemented |
| FR-7.4 | SQLite database indexes all scanned photos (Drizzle ORM) | ❌ Not implemented — `drizzle-orm` is in `package.json` but no schema or DB code exists |

## Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Scan-to-save cycle <= 60s for 4 photos at 300 DPI |
| Performance | Photo detection <= 15s; preview generation <= 5s |
| Performance | UI page load <= 1s on local network |
| Throughput | 100+ photos/hour target |
| Reliability | Scanner errors must not crash application; partial results saved |
| Storage | ~5 MB per photo pair; warn at 80% disk capacity |
| Privacy | Local-only; no cloud uploads |
| Accessibility | WCAG 2.1 AA; minimum 4.5:1 contrast; screen reader support |
| Compatibility | macOS 12+, Ubuntu 20.04+, Debian 11+, Windows 10/11 |
| Test coverage | >= 80% for core scanning logic |

## API Surface (REST + Socket.IO)

### REST endpoints (actual, as of 2026-04-25)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/scanner/discover | Discover eSCL scanners on the local network (mDNS) |
| GET | /api/scanner/status | Scanner availability, model, and eSCL state |
| POST | /api/scan/front | Scan the fronts pass (optional `resolution` body) |
| POST | /api/scan/back | Scan the backs pass (must follow a front scan) |
| POST | /api/scan/complete | Pair fronts/backs and persist the batch |
| POST | /api/scan/reset | Reset orchestrator to IDLE |
| GET | /api/scan/state | Current scan workflow state |
| GET | /api/scan/previews | Thumbnail array for the most recent front-scan detections |
| GET | /api/scan/preview/:position | Full-resolution base64 preview for one detected photo |

> Source of truth: `src/server/routes/scan-routes.ts`. The earlier
> `/api/scan/start`, `/api/scan/pair`, `/api/scan/status/:id`, and `/api/stats`
> endpoints listed in prior PRD revisions were never implemented and have been
> superseded by the routes above.

### Socket.IO events

**Server → Client (emitted by `src/server/websocket/socket-handler.ts`):**

| Event | Payload | Notes |
|-------|---------|-------|
| `state:changed` | `ScanState` | Emitted on any orchestrator state transition; also sent on connect with current state |
| `scan:progress` | `{ scanId, progress }` | Progress updates during a scan |
| `scan:complete` | `{ scanId, photos }` | Emitted on per-scan completion *and* on batch completion (re-uses event with `batchId` as `scanId`) |
| `scan:error` | `{ scanId, message }` | Emitted on orchestrator scan errors |
| `scanner:status` | `{ available }` | Sent on connect and after status checks |
| `photos:detected` | `{ scanId, previews }` | Emitted with thumbnail previews after a successful front scan |
| `batch:complete` | (internal listener; surfaces as `scan:complete`) | Triggered when `completeBatch()` succeeds |

**Client → Server:**

| Event | Payload | Notes |
|-------|---------|-------|
| `scan:start` | `{ scanType: 'front' \| 'back' }` | Triggers `startFrontScan()` / `startBackScan()` |
| `scan:cancel` | `{ scanId }` | ⚠️ Stub — handler logs a warning; no cancellation logic implemented |
| `scan:skip-backs` | `{ frontScanId }` | ⚠️ Emitted by client (`scan-store.ts`) but no server-side handler; treated as no-op |

## Out of Scope (MVP)

- AI-powered scratch removal or colorization
- User accounts / multi-user access
- Cloud backup or remote access
- ADF (automatic document feeder) support
- USB-connected scanner support

## Success Criteria

- Photo detection accuracy >= 95%
- Front/back pairing accuracy >= 90%
- OCR date extraction success >= 70%
- Scan cycle time <= 60s
- Usability rating >= 4.0/5.0 from beta testers
- Zero photo data loss on processing failure

## Post-MVP Roadmap

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 2 | 3-6 months | Advanced AI restoration, scratch removal |
| Phase 3 | 6-9 months | Face/name recognition, smart search |
| Phase 4 | 9-12 months | Optional cloud backup, export formats |
| Phase 5 | 12+ months | ADF support, multiple scanner models |

## Known Drift / Implementation Notes

This section captures the gaps between this PRD and the code as of
2026-04-25. It exists so future readers can see at a glance which
requirements still need implementation work.

- **OCR pipeline (US-3.1, FR-6.1–6.4) is unimplemented.** `tesseract.js` is
  declared in `package.json` but is not imported anywhere under `src/`.
  Photo backs are saved as raw JPEGs with no text extraction.
- **Date-based output / sidecar JSON / SQLite index (US-3.3, FR-7.1–7.4) are
  unimplemented.** `drizzle-orm` is in `package.json`, but no schema, migrations,
  or DB code exists. Output today is a flat per-batch directory:
  `{outputDirectory}/{batchId}/photo-NNN-{position}-{front|back}.jpg`.
- **Auto-deskew (FR-5.2) is unimplemented.** `src/server/processing/enhancer.ts`
  exposes a manual `rotation` option but no rotation-detection logic. This
  partially undermines US-2.1.
- **2% crop margin (FR-5.1) is unimplemented.** `cropPhoto` in
  `src/server/processing/cropper.ts` extracts the raw detected bounds with no
  inset/outset margin.
- **Position-deviation tolerance (FR-3.2) is unimplemented.** Both
  `pairPhotos` (`src/server/processing/pairing.ts`) and the orchestrator's
  internal pairing match by *exact* `GridPosition` string. The "up to 10%"
  tolerance from the PRD does not exist.
- **`originals/` path drift (FR-5.5).** Raw scans are saved to
  `{outputDirectory}/raw/{scanId}-{front|back}.jpg`, not `originals/`. The
  intent (preserve unprocessed scan) is met; only the directory name differs.
- **PNG archival (FR-5.4) is unimplemented.** Only JPEG output is produced.
  Quality is `95` (mozjpeg), not the `92` originally specified — this PRD has
  been updated to match reality.
- **`scan:cancel` Socket.IO event is a stub.** The server logs a warning and
  takes no action; in-flight scans cannot be cancelled.
- **`scan:skip-backs` has no server handler.** The client emits it, but there
  is no listener server-side. The user-facing "skip backs" path relies on
  calling `POST /api/scan/complete` without a back scan, which is supported.
- **Removed/renamed REST endpoints.** Earlier PRD revisions advertised
  `/api/scan/start`, `/api/scan/pair`, `/api/scan/status/:id`, and `/api/stats`.
  None of these exist in code; the API surface table above lists the actual
  routes.
