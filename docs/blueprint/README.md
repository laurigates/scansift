# Blueprint

This directory contains the [Blueprint Development](https://github.com/laurigates/claude-plugins/tree/main/blueprint-plugin) state for ScanSift.

Format version: **3.3.0** (standalone, no monorepo workspaces).

## Directory Structure

```
docs/
├── blueprint/
│   ├── manifest.json       # Blueprint version, project config, document index, task registry
│   ├── README.md           # This file
│   ├── work-overview.md    # Informational progress log (pre-v3.2 artifact, retained)
│   ├── work-orders/        # Task packages for subagent execution (git-ignored)
│   │   ├── completed/
│   │   └── archived/
│   └── ai_docs/            # Curated documentation for AI context
│       ├── libraries/
│       └── project/
├── prds/                   # Product Requirements Documents
├── adrs/                   # Architecture Decision Records
└── prps/                   # Product Requirement Prompts
```

## Documents

| ID | Type | Title | File |
|----|------|-------|------|
| PRD-001 | PRD | ScanSift Product Requirements | [scansift-mvp.md](../prds/scansift-mvp.md) |
| PRD-001-longform | PRD | PhotoScan MVP (original long-form source) | [photoscan-mvp-longform.md](../prds/photoscan-mvp-longform.md) |
| ADR-001 | ADR | Runtime and Framework Selection (Bun + Fastify + React) | [0001-runtime-and-framework.md](../adrs/0001-runtime-and-framework.md) |
| ADR-002 | ADR | Image Processing Pipeline (Sharp + OpenCV.js + Tesseract.js) | [0002-image-processing-pipeline.md](../adrs/0002-image-processing-pipeline.md) |
| ADR-003 | ADR | Biome Toolchain (replacing ESLint + Prettier) | [0003-biome-toolchain.md](../adrs/0003-biome-toolchain.md) |

## Blueprint Commands

| Command | Purpose |
|---------|---------|
| `/blueprint:status` | Show version and configuration |
| `/blueprint:upgrade` | Upgrade to latest blueprint format |
| `/blueprint:derive-prd` | Derive PRD from existing documentation |
| `/blueprint:derive-adr` | Derive ADRs from codebase analysis |
| `/blueprint:derive-plans` | Derive docs from git history |
| `/blueprint:derive-rules` | Derive rules from git commit decisions |
| `/blueprint:prp-create` | Create a Product Requirement Prompt |
| `/blueprint:prp-execute` | Execute a PRP with TDD workflow |
| `/blueprint:work-order` | Create a task package for subagent |
| `/blueprint:generate-rules` | Generate rules from PRDs |
| `/blueprint:sync` | Check for stale generated content |
| `/blueprint:adr-list` | List ADRs with status and dates |
| `/blueprint:adr-validate` | Validate ADR frontmatter against schema |
