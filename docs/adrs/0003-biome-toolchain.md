---
id: ADR-003
title: Biome Toolchain (replacing ESLint + Prettier)
status: Accepted
date: 2026-03-05
domain: build-tooling
---

# ADR-003: Biome Toolchain

## Context

The original PRD specified ESLint 8 + `@typescript-eslint` + Prettier 3 + lint-staged + Husky
as the code quality stack. This is the conventional Node.js setup but carries real costs:

- Five separate packages to install, configure, and keep in sync
- ESLint and Prettier can produce conflicting opinions on the same code
- Slow: ESLint + Prettier on a medium TypeScript codebase runs in 3-10 seconds
- Configuration sprawl: `.eslintrc`, `.eslintignore`, `.prettierrc`, `.prettierignore`,
  `lint-staged.config`, `.husky/` directory

ScanSift added Biome 2.3.8 as a replacement.

## Decision

Use **Biome** as the single tool for formatting and linting. Remove ESLint, Prettier,
lint-staged, and Husky.

Configuration lives in a single `biome.json` at the repository root.

## Biome Configuration (summary)

```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "css": { "parser": { "tailwindDirectives": true } },
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }
}
```

The CI workflow runs `bun run format:check` which invokes `biome check --write=false`.

## Rationale

| Concern | ESLint + Prettier | Biome |
|---------|-------------------|-------|
| Packages to install | 5+ | 1 |
| Config files | 3-4 | 1 (`biome.json`) |
| Lint + format speed | 3-10s | ~300ms |
| TypeScript support | Via plugin | Native |
| CSS/JSON formatting | Prettier only | Built-in |
| Tailwind directive support | Via plugin | Built-in (`tailwindDirectives: true`) |
| Rule conflicts | Common | Impossible (single tool) |

Biome's Rust-based engine is 10-30x faster than ESLint for the typical check-on-save
or CI invocation. At ScanSift's codebase size this means near-instant feedback in the
editor and a negligible CI step.

Biome 2.x ships with a comprehensive TypeScript-aware rule set covering the most
important ESLint + `@typescript-eslint` rules. The gaps (primarily complex
project-wide type-checking rules) are acceptable for a single-developer project.

## Consequences

### Positive
- One install, one config file, one CLI command (`biome check`, `biome format`)
- Fast enough to run as a pre-commit check without lint-staged tooling
- No ESLint/Prettier version conflicts or plugin compatibility matrix to manage
- CSS and JSON formatting handled by the same tool as TypeScript
- Tailwind `@apply` / `@layer` directives parsed without a separate PostCSS plugin

### Negative / Risks
- Biome's lint rule coverage is narrower than the full ESLint ecosystem; some
  advanced rules (e.g., complex import-graph analysis) are unavailable
- Biome 2.x is relatively new; occasional rule changes may appear in minor releases
- Team members familiar with ESLint configuration may need to learn Biome's rule naming
- Auto-fix behavior differs from ESLint in edge cases; requires team buy-in on style

## Alternatives Considered

- **ESLint 9 flat config + Prettier**: Current mainstream default; retained as fallback
  if Biome gaps become blockers
- **dprint**: Fast Rust formatter but linting still requires ESLint
- **oxc-lint**: Emerging Rust linter but not production-ready at decision time
