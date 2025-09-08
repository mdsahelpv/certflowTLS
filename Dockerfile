# Use official Node.js runtime as the base image
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Note: libc6-compat removed due to Alpine mirror issues - not needed for this Node.js app
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
COPY server.ts next.config.mjs tsconfig.json create-admin.js ./

# Use PostgreSQL schema for Prisma client generation
RUN cp prisma/schema.prisma.psql prisma/schema.prisma

# Generate Prisma client with PostgreSQL schema
RUN npx prisma generate

# Build the application (Next standalone output is still produced, but we will run custom server)
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Disable Next.js telemetry for privacy
ENV NEXT_TELEMETRY_DISABLED 1

# Install only essential runtime dependencies
RUN apk add --no-cache postgresql-client curl dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy package files for production dependencies
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy runtime files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./server.ts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/create-admin.js ./create-admin.js

# Copy Next.js build artifacts
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Create necessary directories with correct permissions
RUN mkdir -p /app/logs /app/db && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "tsx", "server.ts"]
