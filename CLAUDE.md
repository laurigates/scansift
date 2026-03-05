# CLAUDE.md — ScanSift

## Project Overview

ScanSift is a network-enabled batch photo scanning application for digitizing physical photo collections. It discovers eSCL-compatible scanners on the local network, scans photos in batch, detects and crops individual photos from multi-photo scans, and extracts dates via OCR.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ES2022 target)
- **Server**: Fastify with Socket.IO for real-time updates
- **Client**: React 18 with Vite, Tailwind CSS, Radix UI
- **State Management**: Zustand
- **Image Processing**: Sharp, OpenCV.js (WASM)
- **OCR**: Tesseract.js
- **Database**: SQLite with Drizzle ORM
- **Testing**: Bun test (unit/integration), Playwright (E2E)
- **Linting/Formatting**: Biome 2.3.8
- **CI/CD**: GitHub Actions (test, container build, release-please)

## Common Commands

```bash
# Development
bun install              # Install dependencies
bun run dev              # Start dev server (API + Vite client)
bun run dev:server       # API server only (hot reload)
bun run dev:client       # Vite client only

# Building
bun run build            # Build server + client
bun run start            # Run production build (port 3000)

# Testing
bun test                 # Run unit/integration tests
bun test --watch         # Watch mode
bun test --coverage      # With coverage (80% threshold)
bun run test:integration # Integration tests only
bun run test:e2e         # Playwright E2E tests
bun run test:e2e:ui      # Playwright UI mode

# Code Quality
bun run check            # Biome check (lint + format, auto-fix)
bun run format           # Biome format (auto-fix)
bun run format:check     # Biome format (check only)
tsc --noEmit             # Type checking

# Scanner Utilities
bun run scanner:discover # Discover scanners on network
bun run scanner:test     # Test scan with a discovered scanner
```

## Project Structure

```
src/
├── client/              # React frontend (Vite)
│   ├── components/      # UI components (ScanButton, PhotoPreview, ScannerStatus)
│   ├── stores/          # Zustand state stores
│   └── styles/          # Tailwind CSS
├── server/              # Fastify backend
│   ├── detection/       # Photo detection via OpenCV.js WASM
│   ├── processing/      # Image cropping, enhancement, front/back pairing
│   ├── routes/          # REST API endpoints (/api/...)
│   ├── services/        # Scanner discovery (mDNS), eSCL client, scan orchestrator
│   └── websocket/       # Socket.IO event handlers
└── shared/              # Shared types and constants
tests/
├── processing/          # Cropper, enhancer, pairing tests
├── scanner/             # eSCL client tests
├── e2e/                 # Playwright E2E tests
└── setup.ts             # Global test setup (mocks better-sqlite3)
scripts/                 # Developer utility scripts
```

## Architecture

- **Client ↔ Server**: REST for commands, Socket.IO for real-time scan progress
- **Scanner Communication**: eSCL protocol over HTTP (industry standard for network scanners)
- **Scanner Discovery**: Bonjour/mDNS via `bonjour-service`
- **Image Pipeline**: Scan → Detect photos (OpenCV) → Crop (Sharp) → Enhance → OCR dates → Store

## Code Conventions

- **Formatting**: Biome — spaces, 2-width indent, 100-char line width, single quotes, always semicolons, trailing commas
- **Commits**: Conventional Commits enforced via pre-commit hook
- **TypeScript**: Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- **Path aliases**: `@/*` → `src/*`, `@server/*`, `@client/*`, `@shared/*`
- **Logging**: Pino (structured JSON logging)
- **Validation**: Zod schemas for runtime type checking
- **Error handling**: Custom error types in `src/server/errors.ts`

## Pre-commit Hooks

Managed by `pre-commit` (Python-based). Hooks run automatically on commit:
1. Trailing whitespace / EOF fixer / YAML/JSON checks
2. Conventional commit message validation
3. Biome check (lint + format)
4. Gitleaks secret detection

Install hooks: `pre-commit install` (runs automatically via `bun install` prepare script)

## Known Limitations

- OpenCV.js WASM tests are skipped (`describe.skip`) — WASM Promise resolution doesn't work in Bun's test runner
- E2E test directory has placeholder `.gitkeep` only — no E2E tests written yet
- Coverage thresholds set at 80% for lines, functions, and statements

## Docker

Multi-stage build using `oven/bun:1-alpine`. Exposes port 3000 with a `/api/health` endpoint for health checks. Published to GHCR via CI.
