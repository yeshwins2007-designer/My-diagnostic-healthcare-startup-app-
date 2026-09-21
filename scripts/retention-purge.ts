/**
 * Retention purge.
 *
 * Two datasets are deliberately short-lived:
 *
 *   Raw GPS pings — a minute-by-minute movement history of a health worker
 *   entering identified patients' homes. Kept only as long as it takes to
 *   investigate a complaint, then collapsed into a coarse per-route summary
 *   that preserves the audit trail without preserving the surveillance.
 *
 *   Voice transcripts — recorded so a coordinator can follow up, purged on
 *   the date stamped on them at creation.
 *
 * Run on a schedule (cron, or a platform scheduled job):
 *   npm run retention:purge
 */

import { PrismaClient } from '@prisma/client';
import { haversineKm } from '../lib/geo';

const db = new PrismaClient();

const PING_RETENTION_DAYS = Number(process.env.PING_RETENTION_DAYS ?? 30);
const TRANSCRIPT_RETENTION_DAYS = Number(process.env.TRANSCRIPT_RETENTION_DAYS ?? 90);

async function purgePings() {
  const cutoff = new Date(Date.now() - PING_RETENTION_DAYS * 86_400_000);

  const routes = await db.route.findMany({
    where: {
      serviceDate: { lt: cutoff },
      pings: { some: {} },
    },
    include: { pings: { orderBy: { recordedAt: 'asc' } } },
  });

  let summarised = 0;
  let deleted = 0;

  for (const route of routes) {
    if (route.pings.length === 0) continue;

    // Collapse to distance, duration and a count. Enough to answer "was the
    // technician where they said they were?" without keeping the track.
    let distanceKm = 0;
    for (let i = 1; i < route.pings.length; i++) {
      distanceKm += haversineKm(
        { lat: route.pings[i - 1].latitude, lng: route.pings[i - 1].longitude },
        { lat: route.pings[i].latitude, lng: route.pings[i].longitude },
      );
    }

    const first = route.pings[0].recordedAt.getTime();
    const last = route.pings[route.pings.length - 1].recordedAt.getTime();

    await db.visitRouteSummary.create({
      data: {
        routeId: route.id,
        distanceKm: Math.round(distanceKm * 100) / 100,
        durationMin: Math.round((last - first) / 60_000),
        pingCount: route.pings.length,
        pingsPurgedAt: new Date(),
      },
    });

    const result = await db.locationPing.deleteMany({ where: { routeId: route.id } });
    deleted += result.count;
    summarised += 1;
  }

  return { summarised, deleted };
}

async function purgeTranscripts() {
  const result = await db.voiceConversation.updateMany({
    where: { purgeAfter: { lt: new Date() }, transcriptText: { not: '' } },
    data: { transcriptText: '' },
  });
  return result.count;
}

async function expireAccreditations() {
  // A lab whose accreditation has lapsed stops being routable the same day,
  // without anyone having to notice.
  const now = new Date();
  const expired = await db.lab.findMany({
    where: {
      status: 'ACTIVE',
      accreditation: { validUntil: { lt: now } },
    },
    include: { accreditation: true },
  });

  for (const lab of expired) {
    await db.lab.update({
      where: { id: lab.id },
      data: {
        status: 'SUSPENDED',
        statusReason: `NABL accreditation ${lab.accreditation?.certificateNumber} expired on ${lab.accreditation?.validUntil.toISOString().slice(0, 10)}.`,
      },
    });
  }

  return expired.length;
}

async function main() {
  const pings = await purgePings();
  const transcripts = await purgeTranscripts();
  const suspended = await expireAccreditations();

  console.log(`
Retention purge complete.

  GPS pings         ${pings.deleted} deleted across ${pings.summarised} routes, each collapsed to a summary
                    (retention: ${PING_RETENTION_DAYS} days)
  Voice transcripts ${transcripts} cleared
                    (retention: ${TRANSCRIPT_RETENTION_DAYS} days)
  Labs suspended    ${suspended} for expired accreditation
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
