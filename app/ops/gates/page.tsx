import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { evaluateGates } from '@/lib/queries/metrics';
import { Badge, Card, H1, H2, H3, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Growth gates' };
export const dynamic = 'force-dynamic';

/**
 * The screen that enforces the operating blueprint against its own author.
 *
 * Marketplace features and zone two exist in this codebase but stay locked
 * until the live numbers actually meet the criteria. When a gate refuses it
 * names the criterion and the shortfall, so it reads as a plan rather than a
 * wall.
 */
export default async function GrowthGatesPage() {
  const zone = await db.zone.findFirst({ orderBy: { sequence: 'asc' } });
  const { gates } = await evaluateGates(zone?.id);
  const waitlisted = await db.waitlistEntry.count({ where: { status: 'WAITING' } });

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Growth gates</H1>
          <Lead>
            Software is the reward for proven demand, not the route to it. These features are
            built and locked; each unlocks itself when the numbers say so, and not before.
          </Lead>
        </Stack>

        <Stack gap="md">
          {gates.map((gate) => (
            <Card key={gate.key} tone={gate.passed ? 'green' : 'sunken'}>
              <Stack gap="md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <H2 className="text-[var(--text-h3)]">{gate.label}</H2>
                  <Badge tone={gate.passed ? 'green' : 'neutral'}>
                    {gate.passed ? 'Unlocked' : 'Locked'}
                  </Badge>
                </div>

                <ul className="flex flex-col gap-2">
                  {gate.criteria.map((c) => (
                    <li
                      key={c.key}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)] pb-2 last:border-b-0"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className={
                            c.met
                              ? 'text-[var(--color-green)]'
                              : 'text-[var(--color-ink-faint)]'
                          }
                        >
                          {c.met ? '✓' : '○'}
                        </span>
                        <span>{c.label}</span>
                      </span>
                      <span className="font-mono text-[var(--text-small)]">
                        <span className={c.met ? '' : 'font-bold text-[var(--color-red)]'}>
                          {c.actual}
                        </span>
                        <span className="text-[var(--color-ink-faint)]"> / {c.required}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="rounded-[var(--radius-control)] border-2 border-[var(--color-line)] bg-[var(--color-surface)] p-4 leading-relaxed">
                  {gate.guidance}
                </p>
              </Stack>
            </Card>
          ))}
        </Stack>

        <Card tone="info">
          <Stack gap="sm">
            <H3>Why the waitlist matters</H3>
            <p>
              {waitlisted} famil{waitlisted === 1 ? 'y is' : 'ies are'} currently waiting outside
              the service radius.
            </p>
            <Muted>
              That list is the evidence that justifies opening zone two. It is not a queue to
              start serving early — a technician doing three visits a morning instead of eight
              triples labour cost per visit and turns contribution margin negative. Enforce the
              radius; waitlist out-of-zone families rather than serving them.
            </Muted>
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}
