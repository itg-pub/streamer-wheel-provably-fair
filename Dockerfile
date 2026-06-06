# Build stage
FROM node:24-alpine AS build

WORKDIR /app

# Install dependencies (cached by lockfile)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Build app
COPY . .
RUN pnpm run build

# Runtime stage
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV HEALTH_PORT=8080
ENV NODE_OPTIONS=--require\ /app/health-server.cjs

# Copy standalone output
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY health-server.cjs ./health-server.cjs

EXPOSE 80 8080

CMD ["node", "server.js"]
