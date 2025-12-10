# Build stage - compile TypeScript and build client
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy dependency files first for better caching
COPY package.json bun.lock ./

# Install all dependencies (including dev for build)
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build client (Vite) and server (Bun)
RUN bun run build

# Runtime stage - minimal Bun runtime
FROM oven/bun:1-alpine

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN bun install --production --frozen-lockfile && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose the server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Run the server
CMD ["bun", "run", "start"]
