# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install pnpm
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

# The standalone server runs on port 3000 by default
EXPOSE 3000

# We use the built standalone server
CMD ["node", "apps/web/server.js"]
