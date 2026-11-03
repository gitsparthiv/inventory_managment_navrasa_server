# ==========================================
# Production Dockerfile for Inventory Microservice
# ==========================================

FROM node:20-alpine AS base

# Install curl for container health check probes
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy dependency manifests first for optimal layer caching
COPY package*.json ./

# Install only production dependencies cleanly
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source code
COPY --chown=node:node . .

# Switch to unprivileged non-root user for security
USER node

# Expose microservice HTTP & WebSocket port
EXPOSE 5000

# Container health probe checking our GET /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start microservice
CMD ["node", "server.js"]

