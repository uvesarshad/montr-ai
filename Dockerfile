# syntax=docker/dockerfile:1

# =============================================================================
# MontrAI — self-host image (fair-code / source-available, n8n Sustainable Use
# License). Single-tenant public core. One image runs both the `web` service
# (custom Next.js + Socket.io server, `node server.js`) and the `worker`
# service (`tsx scripts/workflow-worker.ts`, via `npm run worker`).
#
# Multi-stage build:
#   deps    — install ALL deps (incl. devDeps) for the build + runtime tooling
#   builder — `next build` (strict: next.config.ts has ignoreBuildErrors=false,
#             so the tree must be typecheck-green to produce this image)
#   runner  — minimal Debian runtime with ffmpeg + the built app
#
# NOTE: the runtime does NOT use Next's `standalone` output. `server.js` requires
# `next` directly and runs `app.prepare()`, and the worker executes TypeScript via
# `tsx` at runtime — both need the real node_modules + source on disk. We therefore
# carry the full (pruned to production where possible) node_modules into the runner.
# =============================================================================

ARG NODE_VERSION=24-bookworm-slim

# -----------------------------------------------------------------------------
# Stage 1 — deps: install all dependencies (dev + prod) for building.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# git + build-essential cover any dep with a `git+` source or a native gyp build
# (onnxruntime-node, etc.). ca-certificates so npm/registry TLS works.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates git python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
# Full install (devDeps included): the build needs `cross-env`, `tsx`,
# `typescript`, `tailwindcss`, `postcss`; the worker needs `tsx` at runtime.
# We use `npm install` (not `npm ci`): the committed lock is generated on the
# maintainer's host and omits some platform-conditional optional deps (e.g.
# @emnapi/* for the Linux native/wasm variants of onnxruntime/sharp), which makes
# strict `npm ci` fail "Missing: … from lock file". `npm install` resolves the
# correct per-platform deps for this Linux image. `--include=dev` forces devDeps
# even if NODE_ENV=production (else `cross-env` is missing → `npm run build` 127).
RUN npm install --include=dev --no-audit --no-fund

# -----------------------------------------------------------------------------
# Stage 2 — builder: produce the production Next.js build.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Telemetry off; allow large builds (next build is memory-hungry).
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=8192
# TLS-intercepting corporate networks: next/font (Google Fonts fetch) + Mongo SRV
# fail without the system CA bundle. The base is Node 24, so `--use-system-ca`
# (Node >= 22) is available — it is left OFF by default (clean public registries
# don't need it) but you can enable it on such a network with
# `--build-arg EXTRA_NODE_OPTIONS=--use-system-ca`. (Build map §2.)
ARG EXTRA_NODE_OPTIONS=""
ENV NODE_OPTIONS="${NODE_OPTIONS} ${EXTRA_NODE_OPTIONS}"

# Build-time-only secrets (source-map upload) are passed as build args when CI
# uploads to Sentry. Empty by default — the Sentry plugin no-ops without a token.
ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

# Strict production build. `npm run build` === `cross-env NODE_ENV=production
# next build`. Fails the image if the tree is not typecheck/lint clean.
RUN npm run build

# Keep the FULL node_modules in the runtime image (no prune). The runtime
# genuinely needs several devDependencies that are NOT in `dependencies`:
#   * `typescript` — `server.js` boots Next, which loads + transpiles
#     `next.config.ts` ON STARTUP; without it Next auto-installs typescript on
#     boot and crashes (offline / behind a TLS proxy: "Failed to load
#     next.config.ts").
#   * `tsx`        — the worker runs `tsx scripts/workflow-worker.ts`.
# Pruning then re-adding only these proved unreliable (npm skips named devDeps
# after `prune --omit=dev`, and `--include=dev` re-adds the entire dev tree
# anyway, so the prune saves nothing). The runner stage copies the builder's
# node_modules verbatim. cross-env is build-only; runtime calls node/tsx directly.

# -----------------------------------------------------------------------------
# Stage 3 — runner: lean runtime with ffmpeg.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# ffmpeg: the AI slideshow→video pipeline (src/lib/social/video/slideshow.ts)
# shells out to ffmpeg via fluent-ffmpeg. @ffmpeg-installer/ffmpeg also ships a
# bundled binary, but installing the system ffmpeg guarantees a working codec set
# and matches `serverExternalPackages` (those packages are required at runtime
# from node_modules, not bundled). ca-certificates for outbound TLS; tini for
# clean PID-1 signal handling (graceful worker drain / web shutdown).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# --- App payload -------------------------------------------------------------
# Full node_modules (prod + tsx) — the custom server requires `next` at runtime
# and the worker runs TS through `tsx`. Plus the built `.next`, public assets,
# and all source the runtime executes (server.js, server/, src/, scripts/,
# next.config.ts, tsconfig.json, instrumentation files, voice ML models).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
# Sentry config files live at repo root (referenced by the Next runtime / Sentry
# plugin). `instrumentation.ts` + `instrumentation-client.ts` live under src/ and
# are already copied with the src/ tree above, so they need no separate COPY.
COPY --from=builder /app/sentry.edge.config.ts ./
COPY --from=builder /app/sentry.server.config.ts ./

# Run as the unprivileged `node` user that the base image provides.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# tini as PID 1 → correct SIGTERM forwarding to node/tsx on `docker stop`.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default command runs the web server. The `worker` service in docker-compose
# overrides this with `npm run worker` (tsx scripts/workflow-worker.ts).
# AUTH_TRUST_HOST must be set (env_file/.env) when running behind a reverse proxy
# (Nginx/CloudPanel) or BetterAuth rejects the proxied host. See build map §2.
CMD ["node", "server.js"]
