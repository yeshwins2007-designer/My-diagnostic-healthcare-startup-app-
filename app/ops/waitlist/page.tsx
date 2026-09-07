import type { Metadata } from 'next';
import { db } from '@/lib/db';
import {
  Badge,
  Card,
  EmptyState,
  H1,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Waitlist' };
export const dynamic = 'force-dynamic';

/**
 * Out-of-zone demand, captured rather than discarded.
 *
 * This list is the evidence that justifies opening zone two. It is explicitly
 * not a queue to start serving early: a technician doing three visits a morning
 * instead of eight triples labour cost per visit and turns contribution margin
 * negative.
 */
export default async function WaitlistPage() {
  const entries = await db.waitlistEntry.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { zone: true },
  });

  const waiting = entries.filter((e) => e.status === 'WAITING');

  // Where the demand is clustering tells you which zone to open next.
  const byArea = new Map<string, number>();
  for (const entry of waiting) {
    const area = entry.addressText.split(',')[0].trim();
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }
  const clusters = [...byArea.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Waitlist</H1>
          <Lead>
            {waiting.length} famil{waiting.length === 1 ? 'y' : 'ies'} outside the service
            radius. Do not serve them — that is how route density collapses. Call them the day
            the next zone opens.
          </Lead>
        </Stack>

        {clusters.length > 0 && (
          <Card tone="info">
            <Stack gap="sm">
              <H3>Where demand is clustering</H3>
              <div className="flex flex-wrap gap-2">
                {clusters.map(([area, count]) => (
                  <Badge key={area} tone="info">
                    {area} — {count}
                  </Badge>
                ))}
              </div>
              <Muted>
                Pick zone two where the cluster is densest and there is a candidate anchor lab
                within a 3–5 km ride. One anchor lab per zone.
              </Muted>
            </Stack>
          </Card>
        )}

        {entries.length === 0 ? (
          <EmptyState
            title="Nobody waiting"
            body="When someone books from an address outside the radius, the booking is refused into this list rather than accepted."
          />
        ) : (
          <Stack gap="sm">
            {entries.map((entry) => (
              <Card key={entry.id} tone={entry.status === 'WAITING' ? 'surface' : 'sunken'}>
                <Stack gap="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <H3 className="text-[var(--text-lead)]">
                      {entry.patientName}, {entry.patientAge}
                    </H3>
                    <div className="flex gap-2">
                      {entry.distanceKm && (
                        <Badge tone={entry.distanceKm > 10 ? 'red' : 'yellow'}>
                          {entry.distanceKm.toFixed(1)} km away
                        </Badge>
                      )}
                      <Badge tone={entry.status === 'WAITING' ? 'neutral' : 'green'}>
                        {entry.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                  <Muted>
                    {entry.addressText} · {entry.callerName} ·{' '}
                    <a
                      href={`tel:${entry.callerPhone}`}
                      className="inline-flex min-h-12 items-center font-semibold underline"
                    >
                      {entry.callerPhone}
                    </a>
                  </Muted>
                  {entry.note && <p>{entry.note}</p>}
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
