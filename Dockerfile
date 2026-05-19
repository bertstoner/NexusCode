# ── base: workspace install ───────────────────────────────────────────────────
FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc \
     tsconfig.base.json tsconfig.json ./
COPY artifacts/ ./artifacts/
COPY lib/ ./lib/
COPY cli/ ./cli/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ── api-server build ──────────────────────────────────────────────────────────
FROM base AS api-build
RUN pnpm --filter @workspace/api-server run build

# ── api-server runtime ────────────────────────────────────────────────────────
FROM node:22-slim AS api-server
WORKDIR /app
COPY --from=api-build /app /app
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--enable-source-maps", "/app/artifacts/api-server/dist/index.mjs"]

# ── frontend build ────────────────────────────────────────────────────────────
FROM base AS frontend-build
ENV PORT=8081 BASE_PATH=/__mockup
RUN pnpm --filter @workspace/mockup-sandbox run build

# ── frontend runtime (nginx) ──────────────────────────────────────────────────
FROM nginx:alpine AS frontend
COPY --from=frontend-build /app/artifacts/mockup-sandbox/dist /usr/share/nginx/html/__mockup
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ── cli build ─────────────────────────────────────────────────────────────────
FROM base AS cli-build
WORKDIR /app/cli
RUN node build.mjs

# ── cli runtime ───────────────────────────────────────────────────────────────
FROM node:22-slim AS cli
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=cli-build /app /app
COPY cli/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
