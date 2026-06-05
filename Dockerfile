# =====================================================
# Stage 1: deps
# =====================================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi && \
    npm cache clean --force

# =====================================================
# Stage 2: runtime
# =====================================================
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Crear usuario no-root
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app . .

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "server.js"]
