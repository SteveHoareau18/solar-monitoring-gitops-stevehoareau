# Stage 1 — build deps
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2 — runtime
FROM node:18-alpine
WORKDIR /app
RUN addgroup -S solar && adduser -S solar -G solar
COPY --from=builder /app/node_modules ./node_modules

# copy application code
COPY . .

USER solar
ENV NODE_ENV=production
EXPOSE 9100

CMD ["node", "app.js"]
# Stage 2 — runtime
FROM node:18-alpine
WORKDIR /app
RUN addgroup -S solar && adduser -S solar -G solar
COPY --from=builder /app/node_modules ./node_modules

COPY . .

USER solar
ENV NODE_ENV=production
EXPOSE 9100

# Health check pour Kubernetes
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9100/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "app.js"]
