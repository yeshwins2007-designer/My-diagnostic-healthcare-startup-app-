import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadFamilyContext, loadReportTimeline } from '@/lib/queries/caregiver';
import { brand } from '@/lib/brand';
import {
  Badge,
  Card,
  Disclaimer,
  EmptyState,
  H1,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const BAND_TONE = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' } as const;
const BAND_LABEL = {
  GREEN: 'All within normal limits',
  YELLOW: 'Small changes — discuss at the next appointment',
  RED: 'Needs medical attention',
} as const;

export default async function ReportsPage() {
  const { family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');

  const reports = await loadReportTimeline(family.id);

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Reports</H1>
          <Lead>
            Every report here has been signed by the laboratory’s pathologist and checked by one
            of our coordinators before release.
          </Lead>
        </Stack>

        {reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            body="A report appears here once the laboratory has processed the sample and its pathologist has signed it. We call you within 24 hours of every one."
          />
        ) : (
          <Stack gap="md">
            {reports.map((report) => {
              const band = report.overallBand as keyof typeof BAND_TONE;
              const openCritical = report.criticals.some((c) => c.status !== 'CLOSED');
              const callDone = report.followUps.some((f) => f.status === 'COMPLETED');

              return (
                <Card key={report.id} tone={band === 'RED' ? 'red' : 'surface'}>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>
                        {report.patient.name} ·{' '}
                        {report.releasedAt?.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </H3>
                      <Badge tone={BAND_TONE[band]}>{BAND_LABEL[band]}</Badge>
                    </div>

                    {openCritical && (
                      <p className="font-semibold text-[var(--color-red)]">
                        The laboratory flagged something urgent. Please contact their doctor
                        today — we have already called you.
                      </p>
                    )}

                    <Muted>
                      {report.parameters.length} test
                      {report.parameters.length === 1 ? '' : 's'} · processed at{' '}
                      {report.lab.name}
                      {report.pathologistName && ` · signed by ${report.pathologistName}`}
                    </Muted>

                    {callDone && (
                      <Muted>We called you about this report and recorded what you said.</Muted>
                    )}

                    <div className="flex flex-wrap gap-4 pt-2">
                      <Link
                        href={`/caregiver/reports/${report.id}`}
                        className="font-semibold underline"
                      >
                        Open the full report
                      </Link>
                      <Link
                        href={`/report/${report.id}/card`}
                        className="font-semibold underline"
                      >
                        Printable card for {report.patient.name.split(' ')[0]}
                      </Link>
                    </div>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        <Disclaimer text={brand.disclaimer} />
      </Stack>
    </Page>
  );
}
