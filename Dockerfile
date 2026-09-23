# syntax=docker/dockerfile:1.7
# NanSigil: Elysia on Bun. Production deps only, run from a
# distroless Bun image (no shell, non-root) with a read-only filesystem in mind:
# the service writes nothing to disk.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM oven/bun:${BUN_VERSION}-distroless AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
# The distroless image runs as root and has no `bun` account, so the user is
# numeric. 1000 is the uid of `bun` in the alpine image the deps stage uses.
COPY --from=deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --chown=1000:1000 package.json ./
COPY --chown=1000:1000 src ./src
COPY --chown=1000:1000 fixtures ./fixtures
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["src/index.ts"]
