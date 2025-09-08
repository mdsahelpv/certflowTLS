# ================================
# BASE IMAGE
# ================================
FROM node:18-alpine AS base
WORKDIR /app

# Install essential runtime dependencies
RUN apk add --no-cache postgresql-client curl dumb-init

# ================================
# DEPENDENCIES INSTALL (BUILD TIME)
# ================================
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies)
RUN npm ci

# ================================
# BUILD APP
# ================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./

# Copy Prisma schema and source code
COPY prisma ./prisma
COPY src ./src
COPY public ./public
COPY server.ts next.config.mjs tsconfig.json create-admin.js ./

# Copy and rename schema if needed
RUN cp prisma/schema.prisma.psql prisma/schema.prisma || true

# Generate Prisma client (pre-generates engines)
RUN npx prisma generate --schema=prisma/schema.prisma

# Build Next.js app
RUN npm run build

# Remove devDependencies to slim image
RUN npm prune --production

# ================================
# RUN APP (PRODUCTION)
# ================================
FROM node:18-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache postgresql-client dumb-init

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy built app from builder
COPY --from=builder /app ./

# Make non-root user the owner
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["npx", "tsx", "server.ts"]
