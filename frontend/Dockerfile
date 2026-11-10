FROM node:22-alpine AS deps
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
ENV npm_config_registry=${NPM_REGISTRY}
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=127.0.0.1
RUN addgroup -g 1500 -S darsjo && adduser -u 1500 -S darsjo -G darsjo
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER darsjo
EXPOSE 3000
CMD ["node", "server.js"]
