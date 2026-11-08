#!/bin/sh
# Pilot container startup. Safe to run on every restart.
set -eu

DATA_DIR="${DATA_DIR:-/data}"
SEED_MARKER="${DATA_DIR}/.seeded"

echo "==> Applying schema to ${DATABASE_URL}"
npx prisma db push --skip-generate

# scripts/seed.ts truncates before it writes. Guarding on a marker that lives
# on the volume — not in the image — is what stops `docker compose restart`
# from destroying a week of pilot data.
if [ -f "${SEED_MARKER}" ]; then
  echo "==> Existing pilot data found; leaving it alone."
elif [ "${PILOT_SEED_DEMO_DATA:-true}" = "false" ]; then
  echo "==> PILOT_SEED_DEMO_DATA=false; starting with an empty database."
  echo "    Create your first ops user through /join."
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "${SEED_MARKER}"
else
  echo "==> First run. Seeding demo data (zone, partner labs, 12 families)."
  echo "    Set PILOT_SEED_DEMO_DATA=false to start empty instead."
  npm run seed
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "${SEED_MARKER}"
fi

echo "==> Starting SwasthaSetu on port ${PORT:-3000}"
exec npm run start
