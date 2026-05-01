# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install pnpm and native build tools (required for oniguruma, better-sqlite3, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ gcc \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

# Copy workspace configuration and lockfile
# We copy the lockfile to ensure reproducible builds
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/mcp/package.json ./apps/mcp/
COPY packages/core/package.json ./packages/core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# WebSocket port is baked into the client bundle at build time via
# NEXT_PUBLIC_WS_PORT. Override at build with --build-arg WS_PORT=...
ARG WS_PORT=3001
ENV NEXT_PUBLIC_WS_PORT=${WS_PORT}

# Build everything
# This will build @ctxnest/core first, then apps/web and apps/mcp
RUN pnpm build

# Stage 2: Runner
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV CTXNEST_DATA_DIR=/app/data
ENV CTXNEST_DB_PATH=/app/data/ctxnest.db

# Create data directory with proper permissions
RUN mkdir -p /app/data

# Copy built standalone web app
COPY --from=builder /app/apps/web/next.config.ts ./
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy built MCP server for optional use via docker exec
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist
COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/package.json

# Web UI on 3000, file-watcher WebSocket on WS_PORT (default 3001).
EXPOSE 3000 3001

# We use the built standalone server
CMD ["node", "apps/web/server.js"]
