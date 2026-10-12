import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadFamilyContext, loadReportTimeline } from '@/lib/queries/caregiver';
import { brand } from '@/lib/brand';
import { Morph } from '@/components/morph';
import {
  Badge,
  Disclaimer,
  EmptyState,
  Eyebrow,
  H1,
  H3,
  Lead,
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
          <ul className="stagger flex flex-col gap-3">
            {reports.map((report) => {
              const band = report.overallBand as keyof typeof BAND_TONE;
              const openCritical = report.criticals.some((c) => c.status !== 'CLOSED');
              const callDone = report.followUps.some((f) => f.status === 'COMPLETED');

              return (
                <li key={report.id}>
                  {/* Shares its name with the report's header: opening it morphs. */}
                  <Morph name={`report-${report.id}`}>
                    <article
                      className={`panel flex flex-col gap-4 rounded-[var(--radius-card-lg)] border p-5 ${
                        band === 'RED' ? '!border-[var(--color-red)] bg-[var(--color-red-wash)]' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="reading text-small text-[var(--color-ink-faint)]">
                          {report.releasedAt?.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <Badge tone={BAND_TONE[band]}>{BAND_LABEL[band]}</Badge>
                      </div>

                      <H3>
                        {report.patient.name} ·{' '}
                        {report.releasedAt?.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </H3>

                      {openCritical && (
                        <p className="font-medium text-[var(--color-red)]">
                          The laboratory flagged something urgent. Please contact their doctor
                          today — we have already called you.
                        </p>
                      )}

                      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-line)]">
                        <div className="flex flex-col gap-1.5 bg-[var(--color-surface)] p-3">
                          <Eyebrow as="dt">Tests</Eyebrow>
                          <dd className="reading">{report.parameters.length}</dd>
                        </div>
                        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 bg-[var(--color-surface)] p-3">
                          <Eyebrow as="dt">Processed at</Eyebrow>
                          <dd className="truncate text-small">{report.lab.name}</dd>
                        </div>
                      </dl>

                      <p className="text-small text-[var(--color-ink-faint)]">
                        {report.parameters.length} test
                        {report.parameters.length === 1 ? '' : 's'} · processed at{' '}
                        {report.lab.name}
                        {report.pathologistName && ` · signed by ${report.pathologistName}`}
                      </p>

                      {callDone && (
                        <p className="flex items-center gap-2 text-small text-[var(--color-ink-faint)]">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
                          We called you about this report and recorded what you said.
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2.5 pt-1">
                        <Link
                          href={`/caregiver/reports/${report.id}`}
                          className="btn-glow inline-flex min-h-12 items-center rounded-[var(--radius-control)] px-4 text-small font-medium text-[var(--color-primary-ink)]"
                        >
                          Open the full report
                        </Link>
                        <Link
                          href={`/report/${report.id}/card`}
                          className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-4 text-small font-medium hover:bg-[var(--color-primary-wash)]"
                        >
                          Printable card for {report.patient.name.split(' ')[0]}
                        </Link>
                      </div>
                    </article>
                  </Morph>
                </li>
              );
            })}
          </ul>
        )}

        <Disclaimer text={brand.disclaimer} />
      </Stack>
    </Page>
  );
}
