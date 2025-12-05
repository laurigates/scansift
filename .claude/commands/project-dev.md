---
description: "Start development server for local testing"
allowed-tools: ["Bash"]
---

Start the development environment:

1. **Backend**: Start Fastify server with hot reload
   ```bash
   pnpm dev:server
   ```

2. **Frontend**: Start Vite dev server
   ```bash
   pnpm dev:client
   ```

3. **Or combined**:
   ```bash
   pnpm dev
   ```

Report:
- Server URLs (backend API, frontend)
- Any startup errors
