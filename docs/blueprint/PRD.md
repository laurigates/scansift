---
id: PRD-001
title: ScanSift Product Requirements
status: accepted
created: 2026-03-05
source: .claude/blueprints/prds/photoscan-mvp.md
---

# PRD-001: ScanSift

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

| ID | Story | Priority |
|----|-------|----------|
| US-1.1 | Scan 4 photos at once on flatbed | P0 |
| US-1.2 | Trigger scan from mobile phone | P0 |
| US-1.3 | Scan fronts then backs, auto-pair by position | P0 |
| US-1.4 | Real-time progress feedback with thumbnails | P0 |
| US-2.1 | Auto-crop and deskew detected photos | P0 |
| US-2.2 | Automatic contrast / white-balance enhancement | P1 |
| US-3.1 | OCR date extraction from photo backs | P1 |
| US-3.3 | Date-based folder organization, sidecar JSON | P1 |

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
- FR-1.1: Discover eSCL-compatible scanners on local network via mDNS (`_uscan._tcp`)
- FR-1.2: Communicate with scanner using eSCL/AirPrint protocol (HTTP + XML)
- FR-1.3: Support 300 DPI (default) and 600 DPI (high quality)
- FR-1.4: Report scanner status: ready / busy / error / offline

### FR-2: Photo Detection
- FR-2.1: Detect 1-4 photos per flatbed scan
- FR-2.2: Use Canny edge detection + contour analysis (OpenCV.js)
- FR-2.3: Handle portrait and landscape orientations, rotation up to 45 deg
- FR-2.4: Assign grid positions (top-left, top-right, bottom-left, bottom-right)
- FR-2.5: Output per-photo confidence score

### FR-3: Front/Back Pairing
- FR-3.1: Match fronts to backs by grid position
- FR-3.2: Tolerate position deviation up to 10%
- FR-3.3: Gracefully handle missing backs (save front-only)

### FR-4: Web Interface
- FR-4.1: Responsive UI accessible from mobile (iOS 14+ Safari, Android Chrome 90+)
- FR-4.2: Touch targets minimum 44x44pt
- FR-4.3: Real-time progress via Socket.IO
- FR-4.4: Thumbnail preview grid (2x2) after detection
- FR-4.5: Works fully offline on local network

### FR-5: Image Processing Pipeline
- FR-5.1: Crop to detected bounds with 2% margin (Sharp)
- FR-5.2: Deskew rotation correction
- FR-5.3: Auto white-balance and contrast normalization
- FR-5.4: Save as JPEG (quality 92%) with optional PNG archival
- FR-5.5: Preserve original unprocessed scan in `originals/`

### FR-6: OCR and Metadata
- FR-6.1: OCR photo backs with Tesseract.js
- FR-6.2: Parse date patterns (MM/DD/YYYY, Month Year, etc.)
- FR-6.3: Write extracted date to EXIF tags and sidecar JSON
- FR-6.4: Preserve all extracted text even when no date is found

### FR-7: File Organization
- FR-7.1: Output structure: `processed/YYYY/MM/YYYY-MM-DD_NNN_front.jpg`
- FR-7.2: Undated photos land in `processed/unknown/`
- FR-7.3: Sidecar JSON per photo with all metadata
- FR-7.4: SQLite database indexes all scanned photos (Drizzle ORM)

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

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/scan/start | Initiate scan (`front` or `back`, resolution) |
| GET | /api/scan/status/:id | Poll scan progress |
| GET | /api/scan/previews | Fetch thumbnail array after detection |
| POST | /api/scan/pair | Link front and back scan IDs |
| GET | /api/scanner/status | Scanner availability and model |
| GET | /api/stats | Session and lifetime photo counts |

Socket.IO events: `scan:progress`, `scan:complete`, `photos:detected`, `scan:error`

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
