# syntax=docker/dockerfile:1.7
# API and worker image (same image, different command). Build from the repository root:
#   docker build -f infrastructure/docker/api.Dockerfile -t ecommerce-api .
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
# Only the API and the workspace packages it uses (not the frontends or browser tooling).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@repo/api..."
# Prisma's config needs a URL to generate the client; nothing connects at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter "@repo/api..." build
# A self-contained production copy of the API with only its runtime dependencies.
RUN pnpm --filter @repo/api deploy --prod /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
# Render and most hosts set PORT; the API reads it.
CMD ["node", "dist/main.js"]
