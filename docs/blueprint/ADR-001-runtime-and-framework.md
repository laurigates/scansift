---
id: ADR-001
title: Runtime and Framework Selection (Bun + Fastify + React)
status: accepted
created: 2026-03-05
---

# ADR-001: Runtime and Framework Selection

## Context

ScanSift needs a full-stack TypeScript environment capable of:

- Running a local HTTP/WebSocket server that drives scanner hardware
- Serving a mobile-responsive React UI over the local network
- Processing large image buffers (300-600 DPI flatbed scans, 30-80 MB TIFF/JPEG)
- Executing TypeScript directly with no build step required in development

The original PRD specified Node.js 20 LTS with tsx, pnpm, Fastify, and Vitest. During Phase 0
prototyping the project switched to Bun.

## Decision

Use **Bun** as the runtime, package manager, and test runner. Retain **Fastify** as the HTTP
server framework and **React 18 + Vite** as the frontend stack.

## Rationale

### Bun over Node.js + pnpm

| Concern | Node.js 20 + pnpm | Bun |
|---------|-------------------|-----|
| TypeScript execution | Requires tsx or ts-node | Native, zero config |
| Package install speed | Fast (pnpm) | Faster (binary lockfile) |
| Test runner | Vitest (separate install) | Built-in (`bun test`) |
| SQLite driver | Requires better-sqlite3 | Built-in `bun:sqlite` |
| Start-up time | ~200ms | ~10ms |
| Docker image size | node:20-alpine + pnpm | bun:alpine |

Bun's built-in SQLite, native TypeScript execution, and built-in test runner remove three
separate dependencies and their build complexities. The faster start-up time benefits both
development hot-reload and the Docker container cold-start.

### Fastify as HTTP server

Fastify was chosen over Express and Hono for:
- Schema-based request validation (TypeBox / JSON Schema) with no extra library
- Official Socket.IO adapter (`@fastify/socket.io`) for real-time progress events
- Static file serving plugin (`@fastify/static`) to serve the Vite build
- TypeScript-first plugin API with full type inference
- Higher raw throughput than Express (relevant for streaming large scan images)

### React 18 + Vite on the client

- React 18 provides the concurrent rendering and `Suspense` boundaries used for async
  scan state transitions
- Vite delivers sub-second HMR during development and tree-shaken production bundles
- Zustand provides minimal-boilerplate global state for scanner status and scan session
- Radix UI + Tailwind CSS give accessible, unstyled primitives styled with utility classes

## Consequences

### Positive
- Single `bun install` / `bun run dev` workflow with no separate runtime setup
- Built-in SQLite removes the need for `better-sqlite3` native bindings
- Bun's native TypeScript support keeps the source-to-execution path simple
- Smaller Docker images (bun:alpine vs node:20-alpine + extra tooling)

### Negative / Risks
- Bun is not yet 1.x stable for all Node.js APIs; some edge cases require workarounds
- OpenCV.js WASM Promise resolution has a known issue in Bun's test runner
  (workaround: skip those tests in `bun test`, validate in real server context)
- Bun's built-in SQLite API differs slightly from `better-sqlite3` — code targets
  Bun's API and is not directly portable to Node.js without swapping the driver
- Smaller Bun community vs Node.js may delay resolution of runtime bugs

## Alternatives Considered

- **Node.js 20 LTS**: More stable, wider ecosystem, but more boilerplate and slower DX
- **Deno**: Similar native TypeScript support but different module system and smaller
  ecosystem for scanner/image processing packages
- **Express**: Simpler but lacks schema validation, slower than Fastify
- **Next.js**: Full-stack but opinionated server model conflicts with long-running
  scanner service processes
