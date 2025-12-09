# ScanSift

Network-enabled batch photo scanning application for digitizing physical photo collections.

## Features

- **Scanner Discovery**: Automatic detection of eSCL-compatible scanners via mDNS/Bonjour
- **Photo Detection**: Intelligent detection and cropping of multiple photos per scan using edge analysis
- **Batch Processing**: Scan multiple photos at once and automatically separate them
- **Real-time Progress**: WebSocket-based UI updates during scanning and processing
- **Date Extraction**: OCR-based detection of dates from photo backs

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Server**: Fastify with WebSocket support
- **Client**: React 18 with Vite, Tailwind CSS, Radix UI
- **Image Processing**: Sharp, OpenCV.js
- **State Management**: Zustand
- **Database**: SQLite with Drizzle ORM
- **Testing**: Bun test, Playwright

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- An eSCL-compatible scanner on your network

### Installation

```bash
bun install
```

### Development

```bash
# Start development server (API + client)
bun run dev

# Or run separately
bun run dev:server  # API server with hot reload
bun run dev:client  # Vite dev server
```

### Scanner Utilities

```bash
# Discover scanners on your network
bun run scanner:discover

# Test scanning with a discovered scanner
bun run scanner:test
```

### Testing

```bash
bun test                 # Run all tests
bun test --watch         # Watch mode
bun test --coverage      # With coverage
bun run test:e2e         # Playwright E2E tests
```

### Building

```bash
bun run build    # Build server and client
bun run start    # Run production build
```

## Project Structure

```
src/
├── client/           # React frontend
│   ├── components/   # UI components
│   ├── stores/       # Zustand state stores
│   └── styles/       # CSS and Tailwind
├── server/           # Fastify backend
│   ├── detection/    # Photo detection (OpenCV)
│   ├── processing/   # Image processing pipeline
│   ├── routes/       # REST API endpoints
│   ├── services/     # Scanner, storage services
│   └── websocket/    # Real-time event handlers
└── shared/           # Shared types and constants
```

## Documentation

- [OpenCV Setup Guide](docs/OPENCV-SETUP.md) - Photo detection implementation details

## License

MIT
