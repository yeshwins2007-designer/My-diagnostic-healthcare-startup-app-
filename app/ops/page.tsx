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
  Eyebrow,
  H1,
  H2,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';
import { requirePageRole } from '@/lib/auth/session';

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
  await requirePageRole('OPS');
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

        {/* One instrument panel: six cells divided by hairlines. */}
        <div className="stagger panel grid gap-px overflow-hidden rounded-[var(--radius-card-lg)] border bg-[var(--color-line)] md:grid-cols-2 xl:grid-cols-3">
          {verdicts.map((v) => {
            const series = history.map((h) => Number(h[v.key as keyof typeof h] ?? 0));
            return (
              <section
                key={v.key}
                className={`flex flex-col gap-3 p-5 ${v.health === 'BAD' ? 'bg-[var(--color-red-wash)]' : 'bg-[var(--color-surface)]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Eyebrow as="h3" className="pt-1">{v.label}</Eyebrow>
                  <Badge tone={HEALTH_TONE[v.health]}>
                    {v.health === 'NO_DATA' ? 'no data' : v.health.toLowerCase()}
                  </Badge>
                </div>

                <p className="reading text-[2.5rem] leading-none font-medium tracking-tight">{v.display}</p>
                <p className="font-mono text-small text-[var(--color-ink-faint)]">Target {v.target}</p>

                {series.length > 1 && <Sparkline values={series} tone={HEALTH_TONE[v.health]} />}

                <p className="text-small leading-relaxed text-[var(--color-ink-faint)]">{v.meaning}</p>
              </section>
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

const SPARK_COLOR = {
  green: 'var(--color-green)',
  yellow: 'var(--color-yellow)',
  red: 'var(--color-red)',
  neutral: 'var(--color-ink-faint)',
} as const;

/**
 * A dependency-free sparkline: twelve weeks in 40 pixels, a faint area, the
 * line in the metric's status colour and a dot on this week.
 */
function Sparkline({ values, tone }: { values: number[]; tone: keyof typeof SPARK_COLOR }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 240;
  const height = 40;
  const xy = values.map((v, i) => [
    (i / Math.max(1, values.length - 1)) * width,
    height - 3 - ((v - min) / range) * (height - 6),
  ]);
  const points = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const color = SPARK_COLOR[tone];
  const [lx, ly] = xy[xy.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full overflow-visible"
      role="img"
      aria-label={`Trend across the last ${values.length} weeks`}
      preserveAspectRatio="none"
    >
      <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={color} fillOpacity="0.08" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* A zero-length round-capped line stays a circle under the stretched viewBox. */}
      <line x1={lx} x2={lx} y1={ly} y2={ly} stroke={color} strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
