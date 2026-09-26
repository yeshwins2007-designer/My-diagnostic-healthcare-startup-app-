# SwasthaSetu — pilot image.
#
# Debian slim rather than Alpine: Prisma ships glibc query engines, and the
# musl mismatch is the usual cause of "query engine not found" at runtime.
#
# No build arguments. lib/env.ts is server-only and parses process.env as a
# whole object rather than reading process.env.NEXT_PUBLIC_X literally, so
# Next inlines nothing into the client bundle. Every credential — including
# the NEXT_PUBLIC_ ones — is read at runtime, which means one image serves
# every configuration and changing a key is a restart, not a rebuild.

FROM node:22-slim AS builder

# openssl: Prisma links against libssl to generate and run its engines.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# A throwaway URL. Nothing is queried during the build — only /_not-found and
# /manifest.webmanifest prerender, everything else is server-rendered on
# demand — but Prisma wants the variable present to generate.
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate

# lib/env.ts exempts the build phase from its AUTH_SECRET check precisely so
# this works without inventing a production secret. The server still refuses
# to start without one.
RUN npm run build


FROM node:22-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# node_modules comes from the builder rather than a second `npm ci --omit=dev`
# for two reasons: the stages share a base image so the generated Prisma
# engines are already correct for this platform, and the entrypoint genuinely
# needs two devDependencies at runtime — `prisma` to push the schema and `tsx`
# to run the seed. Omitting dev dependencies would break first boot.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next

COPY package.json package-lock.json next.config.ts prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
# scripts/seed.ts and scripts/retention-purge.ts import from ../lib, so the
# library source has to be present for the entrypoint's seed step.
COPY lib ./lib
COPY scripts ./scripts
COPY docker ./docker

RUN chmod +x docker/entrypoint.sh \
  && mkdir -p /data \
  && chown -R node:node /data /app

USER node

# The pilot database lives here, on a named volume, so `docker compose
# restart` keeps the data a pilot exists to accumulate.
ENV DATABASE_URL="file:/data/pilot.db"

EXPOSE 3000

CMD ["./docker/entrypoint.sh"]
