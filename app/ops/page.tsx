import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMondaySheet, metricHistory } from '@/lib/queries/metrics';
import { judge } from '@/lib/sop';
import { formatINR } from '@/lib/money';
import { db } from '@/lib/db';
import {
  Badge,
  Card,
  DataRow,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Monday numbers' };
export const dynamic = 'force-dynamic';

const HEALTH_TONE = {
  GOOD: 'green',
  WATCH: 'yellow',
  BAD: 'red',
  NO_DATA: 'neutral',
} as const;

/**
 * Six numbers on one sheet, reviewed every Monday. Nothing else belongs on
 * this screen — that is the point of it.
 */
export default async function OpsHomePage() {
  const zone = await db.zone.findFirst({ orderBy: { sequence: 'asc' } });
  const [sheet, history] = await Promise.all([
    buildMondaySheet(zone?.id),
    metricHistory(zone?.id, 12),
  ]);

  const verdicts = judge(sheet, history.length > 0);

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>The six numbers</H1>
          <Lead>
            Reviewed every Monday. Ignore everything else until these are healthy.
          </Lead>
          {zone && <Muted>{zone.name} · {zone.radiusKm} km radius</Muted>}
        </Stack>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {verdicts.map((v) => {
            const series = history.map((h) => Number(h[v.key as keyof typeof h] ?? 0));
            return (
              <Card key={v.key} tone={v.health === 'BAD' ? 'red' : 'surface'}>
                <Stack gap="sm">
                  <div className="flex items-start justify-between gap-3">
                    <H3 className="text-[var(--text-lead)]">{v.label}</H3>
                    <Badge tone={HEALTH_TONE[v.health]}>
                      {v.health === 'NO_DATA' ? 'no data' : v.health.toLowerCase()}
                    </Badge>
                  </div>

                  <p className="text-[var(--text-display)] font-bold leading-none">
                    {v.display}
                  </p>
                  <Muted>Target {v.target}</Muted>

                  {series.length > 1 && <Sparkline values={series} />}

                  <p className="text-[var(--text-small)] leading-relaxed text-[var(--color-ink-soft)]">
                    {v.meaning}
                  </p>
                </Stack>
              </Card>
            );
          })}
        </div>

        <Card tone="sunken">
          <Stack gap="sm">
            <H2>Contribution</H2>
            <DataRow
              label="Active subscribers"
              value={String(sheet.activeSubscribers)}
            />
            <DataRow
              label="Contribution margin to date"
              value={formatINR(sheet.contributionMarginPaise)}
              tone={sheet.contributionMarginPaise > 0 ? 'green' : 'red'}
            />
            <Muted>
              Two levers decide whether this works: route density — how many visits one
              technician completes in a small radius — and retention. Density is a geography
              problem, solved by refusing to expand too early. Retention is a relationship
              problem, solved by the same technician, the follow-up call, and never missing a
              slot.{' '}
              <Link href="/ops/gates" className="font-semibold underline">
                See the growth gates
              </Link>
              .
            </Muted>
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}

/** A dependency-free sparkline. Twelve weeks of context in 40 pixels. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 240;
  const height = 40;

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full"
      role="img"
      aria-label={`Trend across the last ${values.length} weeks`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
