ARG TEABLE_BASE_IMAGE=ghcr.io/teableio/teable-community:release.2026-09-01T06-19-16Z.1709@sha256:69fbb810d98f3738adb3834d7aca24e4410c21cdb09d22f75b4e35dc1a690284
FROM node:22.22.3-bookworm AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.13.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=parabolic-pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=parabolic-pnpm,target=/pnpm/store pnpm --filter @teable/app... --filter @teable/db-main-prisma install --offline --frozen-lockfile
RUN pnpm --filter @teable/db-main-prisma prisma-generate

FROM deps AS builder
ENV NODE_ENV=production NEXT_PUBLIC_PARABOLIC_ENABLED=true NEXT_BUILD_ENV_SOURCEMAPS=false NEXT_BUILD_ENV_SENTRY_ENABLED=false NEXT_BUILD_ENV_TYPECHECK=false NODE_OPTIONS=--max-old-space-size=8192
RUN pnpm --filter @teable/app build

# UI-only derivative: the pinned Community backend, dependencies, entrypoint,
# database migrations and storage layout remain those of the installed release.
FROM ${TEABLE_BASE_IMAGE} AS runner
ARG PARABOLIC_REVISION=working-tree
LABEL org.opencontainers.image.source="https://github.com/parabolicx/teable" \
      org.opencontainers.image.revision="${PARABOLIC_REVISION}" \
      io.parabolic.upstream-revision="5ef2238883cad7c3980084de9a9031135fb9734f"
RUN rm -rf /app/apps/nextjs-app/.next
COPY --from=builder --chown=1001:1001 /app/apps/nextjs-app/.next /app/apps/nextjs-app/.next
ENV NEXT_PUBLIC_PARABOLIC_ENABLED=true
