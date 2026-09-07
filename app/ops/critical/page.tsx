import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { buildCriticalCallScript, escalationLevel } from '@/lib/sop/criticalValue';
import { getSessionUser } from '@/lib/auth/session';
import { CriticalCallForm } from '@/components/critical-call-form';
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

export const metadata: Metadata = { title: 'Critical values' };
export const dynamic = 'force-dynamic';

/**
 * The one screen that outranks everything else in the console.
 *
 * Our duty runs in parallel with the pathologist's own communication process:
 * phone the registered caregiver immediately, state plainly that a result needs
 * urgent medical attention, never interpret the value, log the call, follow up
 * in writing. The script below is fixed, not free text.
 */
export default async function CriticalValuesPage() {
  const user = await getSessionUser();

  const alerts = await db.criticalValueAlert.findMany({
    where: { status: { not: 'CLOSED' } },
    orderBy: { raisedAt: 'asc' },
    include: {
      report: {
        include: {
          patient: { include: { family: { include: { members: { include: { user: true } } } } } },
          lab: true,
        },
      },
    },
  });

  const recent = await db.criticalValueAlert.findMany({
    where: { status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
    take: 5,
    include: { report: { include: { patient: true } } },
  });

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Critical values</H1>
          <Lead>
            Call the registered caregiver now. Never interpret the value, never advise
            treatment, never delay the call to a convenient hour.
          </Lead>
        </Stack>

        {alerts.length === 0 ? (
          <EmptyState
            title="No open critical values"
            body="When the laboratory flags a result as critical, it appears here immediately and stays at the top of the console until the caregiver has been called and it has been put in writing."
          />
        ) : (
          <Stack gap="md">
            {alerts.map((alert) => {
              const caregiver = alert.report.patient.family.members[0]?.user;
              const escalation = escalationLevel(alert.raisedAt);
              const script = buildCriticalCallScript({
                caregiverName: caregiver?.name ?? 'the caregiver',
                patientName: alert.report.patient.name,
                parameterName: alert.parameterName,
                coordinatorName: user?.name ?? 'the coordinator',
              });

              return (
                <Card key={alert.id} tone="red">
                  <Stack gap="md">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>
                        {alert.report.patient.name} · {alert.parameterName}
                      </H3>
                      <Badge tone="red">{escalation.message}</Badge>
                    </div>

                    <div className="grid gap-2">
                      <Muted>
                        Caregiver: <strong>{caregiver?.name}</strong> ·{' '}
                        <a href={`tel:${caregiver?.phone}`} className="underline">
                          {caregiver?.phone}
                        </a>
                      </Muted>
                      <Muted>
                        Flagged by {alert.report.lab.name} at{' '}
                        {alert.raisedAt.toLocaleString('en-IN')}
                      </Muted>
                    </div>

                    <Card tone="surface">
                      <Stack gap="sm">
                        <H3 className="text-[var(--text-lead)]">Read this, in this order</H3>
                        <ol className="flex list-decimal flex-col gap-2 pl-6">
                          {script.lines.map((line) => (
                            <li key={line} className="leading-relaxed">
                              {line}
                            </li>
                          ))}
                        </ol>
                      </Stack>
                    </Card>

                    <Card tone="yellow">
                      <Stack gap="sm">
                        <H3 className="text-[var(--text-lead)]">Never say</H3>
                        <ul className="flex list-disc flex-col gap-1 pl-6">
                          {script.neverSay.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </Stack>
                    </Card>

                    <CriticalCallForm alertId={alert.id} />
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        {recent.length > 0 && (
          <Card tone="sunken">
            <Stack gap="sm">
              <H3>Recently closed</H3>
              {recent.map((alert) => (
                <Muted key={alert.id}>
                  {alert.report.patient.name} · {alert.parameterName} · called{' '}
                  {alert.calledAt?.toLocaleString('en-IN')}
                </Muted>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    </Page>
  );
}
