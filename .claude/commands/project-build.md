---
description: "Build the project for production"
allowed-tools: ["Bash"]
---

Build the project:

1. **Type check**: `pnpm type-check`
2. **Lint**: `pnpm lint`
3. **Build backend**: `pnpm build:server`
4. **Build frontend**: `pnpm build:client`

Or combined:
```bash
pnpm build
```

Report:
- Build success/failure
- Any errors or warnings
- Output location
