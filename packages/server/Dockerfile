# Runs the Koa + Socket.IO room/presence/chat server via tsx (same way
# `npm run dev --workspace=packages/server` does) rather than a compiled
# build -- packages/server has no "build" script, and packages/shared /
# packages/game-core are consumed as TS source (main: "./src/index.ts"),
# so a plain tsc build would need path rewriting for no real benefit at
# this project's size.
FROM node:22-slim

WORKDIR /app

# Build tools as a fallback in case sqlite3 has no prebuilt binary for the
# image's platform and falls back to compiling from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy only manifests first so `npm ci` is cached unless deps change.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json

RUN npm ci

COPY packages/shared packages/shared
COPY packages/game-core packages/game-core
COPY packages/server packages/server

ENV NODE_ENV=production
EXPOSE 8000

WORKDIR /app/packages/server
CMD ["npx", "tsx", "src/index.ts"]
